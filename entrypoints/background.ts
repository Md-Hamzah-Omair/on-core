import { browser, type Browser } from 'wxt/browser';
import { deleteAllLocalData, hasPendingIndexingWork, recoverInterruptedIndexing, retryPageIndexing, upsertPage } from '../lib/database';
import { closeOffscreenDocument } from '../lib/offscreen-lifecycle';
import {
  isCaptureRequest,
  isCloseOffscreenDocumentRequest,
  isExtractedPageMessage,
  isRetryIndexingRequest,
  isRunEmbeddingProbeRequest,
  isSearchMemoryRequest,
  isCancelSearchRequest,
  isDeleteAllLocalDataRequest,
  type CaptureResponse,
  type ExtractedPageMessage,
} from '../lib/messages';
import {
  canonicalizeUrl,
  isValidProtocol,
  PageContentError,
  preparePageForStorage,
  type PreparedPage,
  validatePageData,
} from '../lib/pages';

type PendingCapture = {
  processing: boolean;
  resolve: (response: CaptureResponse) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

function failure(code: Extract<CaptureResponse, { ok: false }>['code'], message: string): CaptureResponse {
  return { ok: false, code, message };
}

export default defineBackground(() => {
  const pendingCaptures = new Map<number, PendingCapture>();

  async function ensureOffscreenIndexer() {
    try {
      await browser.offscreen.createDocument({
        justification: 'Generate local embeddings outside the service worker.',
        reasons: ['WORKERS'],
        url: browser.runtime.getURL('/offscreen.html'),
      });
    } catch {
      // Chrome rejects creation when the one allowed offscreen document already exists.
    }

    await browser.runtime.sendMessage({ type: 'RUN_INDEXING_QUEUE', version: 1 });
  }

  async function closeIndexerIfRequested(sender: Browser.runtime.MessageSender) {
    if (sender.url !== browser.runtime.getURL('/offscreen.html')) return;
    await closeOffscreenDocument(
      browser.offscreen,
      (error) => console.error('Could not close the offscreen indexing document.', error),
    );
  }

  async function runEmbeddingProbe(sender: Browser.runtime.MessageSender) {
    const extensionRoot = new URL('/', browser.runtime.getURL('/')).toString();
    if (!sender.url?.startsWith(extensionRoot)) throw new Error('Embedding probe must be requested by an extension page.');
    await ensureOffscreenIndexer();
    return browser.runtime.sendMessage({ type: 'RUN_EMBEDDING_PROBE_OFFSCREEN', version: 1 });
  }

  function isExtensionPage(sender: Browser.runtime.MessageSender): boolean {
    return sender.url?.startsWith(new URL('/', browser.runtime.getURL('/')).toString()) ?? false;
  }

  async function runSearch(message: { requestId: string; query: string; limit: number }, sender: Browser.runtime.MessageSender) {
    if (!isExtensionPage(sender)) throw new Error('SEARCH_FAILED');
    await ensureOffscreenIndexer();
    return browser.runtime.sendMessage({ ...message, type: 'SEARCH_MEMORY_OFFSCREEN', version: 1 });
  }

  async function resumeIndexing() {
    await recoverInterruptedIndexing();
    if (await hasPendingIndexingWork()) {
      await ensureOffscreenIndexer();
    }
  }

  void resumeIndexing();

  function settleCapture(tabId: number, response: CaptureResponse) {
    const pending = pendingCaptures.get(tabId);
    if (!pending) return;

    clearTimeout(pending.timeoutId);
    pendingCaptures.delete(tabId);
    pending.resolve(response);
  }

  function requestExtraction(tabId: number): Promise<CaptureResponse> {
    settleCapture(tabId, failure('SAVE_FAILED', 'A newer capture request replaced the previous one.'));

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        settleCapture(tabId, failure('INJECTION_FAILED', 'Page capture timed out. Reload the page and try again.'));
      }, 5000);

      pendingCaptures.set(tabId, { processing: false, resolve, timeoutId });

      const injection: Browser.scripting.ScriptInjection<[], void> = {
        target: { tabId },
        files: ['/extractor.js'],
      };
      // WXT narrows file paths to the current entrypoint; this uses its emitted
      // unlisted script through the underlying WebExtension API contract.
      const executeScript = browser.scripting.executeScript as (
        details: Browser.scripting.ScriptInjection<[], void>,
      ) => Promise<unknown>;
      void executeScript(injection).catch(() => {
        settleCapture(tabId, failure('INJECTION_FAILED', 'This page cannot be captured. Try a regular HTTP or HTTPS page.'));
      });
    });
  }

  async function captureActivePage(): Promise<CaptureResponse> {
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id === undefined || !activeTab.url) {
      return failure('NO_ACTIVE_TAB', 'No active tab is available to save.');
    }

    if (!isValidProtocol(activeTab.url)) {
      return failure('UNSUPPORTED_URL', 'Only HTTP and HTTPS pages can be saved.');
    }

    return requestExtraction(activeTab.id);
  }

  async function storeExtractedPage(message: ExtractedPageMessage, sender: Browser.runtime.MessageSender) {
    const tabId = sender.tab?.id;
    const senderUrl = sender.tab?.url;
    if (tabId === undefined || !senderUrl) return;

    const pending = pendingCaptures.get(tabId);
    if (!pending || pending.processing) return;
    pending.processing = true;
    clearTimeout(pending.timeoutId);

    if (sender.frameId !== 0) {
      settleCapture(tabId, failure('INVALID_MESSAGE', 'Page capture must run in the top frame.'));
      return;
    }

    if (!isValidProtocol(senderUrl)) {
      settleCapture(tabId, failure('UNSUPPORTED_URL', 'Only HTTP and HTTPS pages can be saved.'));
      return;
    }

    const validation = validatePageData(message.payload);
    if (!validation.valid) {
      const code = message.payload.text.trim() ? 'INVALID_MESSAGE' : 'EMPTY_CONTENT';
      settleCapture(tabId, failure(code, validation.error ?? 'The page data was invalid.'));
      return;
    }

    const senderPageUrl = canonicalizeUrl(senderUrl);
    const extractedPageUrl = canonicalizeUrl(message.payload.url);
    if (senderPageUrl !== extractedPageUrl) {
      settleCapture(tabId, failure('INVALID_MESSAGE', 'The extracted page URL did not match the active tab.'));
      return;
    }

    let prepared: PreparedPage;
    try {
      prepared = preparePageForStorage(message.payload);
    } catch (error) {
      if (error instanceof PageContentError) {
        settleCapture(tabId, failure('EMPTY_CONTENT', error.message));
      } else {
        settleCapture(tabId, failure('SAVE_FAILED', 'The page could not be prepared for local storage.'));
      }
      return;
    }

    try {
      const savedPage = await upsertPage(prepared);
      if (savedPage.id === undefined) {
        throw new Error('Saved page did not receive an identifier.');
      }

      void ensureOffscreenIndexer();
      settleCapture(tabId, {
        ok: true,
        page: {
          id: savedPage.id,
          title: savedPage.title,
          url: savedPage.url,
          savedAt: savedPage.savedAt,
        },
      });
    } catch {
      settleCapture(tabId, failure('SAVE_FAILED', 'The page could not be saved locally. Please try again.'));
    }
  }

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (isCaptureRequest(message)) {
      void captureActivePage()
        .then(sendResponse)
        .catch(() => sendResponse(failure('SAVE_FAILED', 'Could not start page capture. Please try again.')));
      return true;
    }

    if (isRetryIndexingRequest(message)) {
      void retryPageIndexing(message.pageId)
        .then((found) => found ? ensureOffscreenIndexer().then(() => ({ ok: true })) : ({ ok: false, code: 'PAGE_NOT_FOUND' }))
        .then(sendResponse)
        .catch(() => sendResponse({ ok: false }));
      return true;
    }

    if (isDeleteAllLocalDataRequest(message)) {
      void deleteAllLocalData()
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
      return true;
    }

    if (isCloseOffscreenDocumentRequest(message)) {
      void closeIndexerIfRequested(sender);
      return;
    }

    if (isRunEmbeddingProbeRequest(message)) {
      void runEmbeddingProbe(sender)
        .then(sendResponse)
        .catch((error: unknown) => sendResponse({
          ok: false,
          message: error instanceof Error ? error.message : 'Embedding probe failed.',
        }));
      return true;
    }

    if (isSearchMemoryRequest(message)) {
      void runSearch(message, sender).then(sendResponse).catch((error: unknown) => sendResponse({ ok: false, requestId: message.requestId, code: error instanceof Error ? error.message : 'SEARCH_FAILED' }));
      return true;
    }

    if (isCancelSearchRequest(message)) {
      if (isExtensionPage(sender)) {
        void browser.runtime.sendMessage({ requestId: message.requestId, type: 'CANCEL_SEARCH_OFFSCREEN', version: 1 });
      }
      return;
    }

    if (isExtractedPageMessage(message)) {
      void storeExtractedPage(message, sender);
    }
  });
});

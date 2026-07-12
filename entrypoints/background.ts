import { browser, type Browser } from 'wxt/browser';
import { upsertPage } from '../lib/database';
import { isCaptureRequest, isExtractedPageMessage, type CaptureResponse, type ExtractedPageMessage } from '../lib/messages';
import { canonicalizeUrl, createPageRecord, isValidProtocol, validatePageData } from '../lib/pages';

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

    try {
      const savedPage = await upsertPage(createPageRecord(message.payload));
      if (savedPage.id === undefined) {
        throw new Error('Saved page did not receive an identifier.');
      }

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

    if (isExtractedPageMessage(message)) {
      void storeExtractedPage(message, sender);
    }
  });
});

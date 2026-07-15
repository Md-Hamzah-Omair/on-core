import { browser } from 'wxt/browser';
import EmbeddingWorker from '../../workers/embedding.worker?worker';
import { requestOffscreenClose } from '../../lib/offscreen-lifecycle';
import { isCancelSearchOffscreenRequest, isRunEmbeddingProbeOffscreenRequest, isRunIndexingQueueRequest, isSearchMemoryOffscreenRequest } from '../../lib/messages';
import { IndexingController } from './indexing-controller';

const controller = new IndexingController(
  () => new EmbeddingWorker(),
  new URL('models/', browser.runtime.getURL('/offscreen.html')).toString(),
  new URL('wasm/', browser.runtime.getURL('/offscreen.html')).toString(),
);

let closeTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleClose() {
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    void controller.hasPendingWork().then((hasPendingWork) => {
      if (!hasPendingWork) {
        controller.dispose();
        void requestOffscreenClose(
          (message) => browser.runtime.sendMessage(message),
          (error) => console.error('Could not ask the background worker to close the offscreen document.', error),
        );
      }
    }).catch((error) => console.error('Could not determine whether offscreen indexing is idle.', error));
  }, 60000);
}

function runIndexing() {
  if (closeTimer) clearTimeout(closeTimer);
  void controller.run().finally(scheduleClose);
}

browser.runtime.onMessage.addListener((message) => {
  if (isRunIndexingQueueRequest(message)) runIndexing();
  if (isRunEmbeddingProbeOffscreenRequest(message)) {
    return controller.runProbe()
      .then((result) => {
        console.info('Embedding runtime probe succeeded.', result);
        return { ok: true, ...result };
      })
      .catch((error: unknown) => {
        console.error('Embedding runtime probe failed.', error);
        return { ok: false, message: error instanceof Error ? error.message : 'Embedding probe failed.' };
      });
  }
  if (isCancelSearchOffscreenRequest(message)) {
    controller.cancelSearch(message.requestId);
    return Promise.resolve({ ok: true, requestId: message.requestId });
  }
  if (isSearchMemoryOffscreenRequest(message)) {
    if (closeTimer) clearTimeout(closeTimer);
    return controller.search(message.requestId, message.query, message.limit, (phase) => {
      try {
        void browser.runtime.sendMessage({
          phase,
          requestId: message.requestId,
          type: 'SEARCH_PROGRESS',
          version: 1,
        }).catch(() => {});
      } catch {
        // Progress delivery is best-effort and must not fail the search.
      }
    })
      .then((result) => ({ ok: true, requestId: message.requestId, ...result }))
      .catch((error: unknown) => ({ ok: false, requestId: message.requestId, code: error instanceof Error ? error.message : 'SEARCH_FAILED' }))
      .finally(scheduleClose);
  }
});

runIndexing();

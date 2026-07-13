import { browser } from 'wxt/browser';
import EmbeddingWorker from '../../workers/embedding.worker?worker';
import { requestOffscreenClose } from '../../lib/offscreen-lifecycle';
import { isRunEmbeddingProbeOffscreenRequest, isRunIndexingQueueRequest } from '../../lib/messages';
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
});

runIndexing();

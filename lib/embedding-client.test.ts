import { describe, expect, it } from 'vitest';
import { EmbeddingClient, type EmbeddingWorkerLike } from './embedding-client';
import { EMBEDDING_DIMENSION, EMBEDDING_MODEL_ID, EMBEDDING_MODEL_REVISION } from './embeddings';

class FakeWorker implements EmbeddingWorkerLike {
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  readonly messages: unknown[] = [];
  terminated = false;

  postMessage(message: unknown) {
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  respond(message: unknown) {
    this.onmessage?.({ data: message } as MessageEvent<unknown>);
  }
}

const item = { contentRevision: 1, pageId: 1, position: 0, text: 'Chunk text' };

describe('EmbeddingClient', () => {
  it('initializes and rejects malformed active responses', async () => {
    const worker = new FakeWorker();
    const client = new EmbeddingClient(() => worker);
    const initialized = client.initialize('models/', 'wasm/');
    const initializeRequest = worker.messages[0] as { requestId: string };
    worker.respond({ requestId: initializeRequest.requestId, status: 'ready', type: 'STATUS', version: 1 });
    await initialized;

    const pending = client.embedBatch([item]);
    const batchRequest = worker.messages[1] as { requestId: string };
    worker.respond({ requestId: batchRequest.requestId, type: 'UNKNOWN', version: 1 });
    await expect(pending).rejects.toThrow('invalid response');
  });

  it('accepts matching unit vectors and rejects duplicate results', async () => {
    const worker = new FakeWorker();
    const client = new EmbeddingClient(() => worker);
    const initialized = client.initialize('models/', 'wasm/');
    const initializeRequest = worker.messages[0] as { requestId: string };
    worker.respond({ requestId: initializeRequest.requestId, status: 'ready', type: 'STATUS', version: 1 });
    await initialized;

    const pending = client.embedBatch([item]);
    const batchRequest = worker.messages[1] as { requestId: string };
    const vector = new Float32Array(EMBEDDING_DIMENSION);
    vector[0] = 1;
    worker.respond({
      dimension: EMBEDDING_DIMENSION, modelId: EMBEDDING_MODEL_ID, modelRevision: EMBEDDING_MODEL_REVISION,
      requestId: batchRequest.requestId, results: [{ ...item, embedding: vector, ok: true }], type: 'BATCH_RESULT', version: 1,
    });
    await expect(pending).resolves.toHaveLength(1);
  });
});

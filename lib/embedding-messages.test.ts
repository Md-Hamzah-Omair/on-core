import { describe, expect, it } from 'vitest';
import { EMBEDDING_BATCH_SIZE, isEmbeddingWorkerRequest, isEmbeddingWorkerResponse } from './embedding-messages';
import { EMBEDDING_DIMENSION, EMBEDDING_MODEL_ID, EMBEDDING_MODEL_REVISION } from './embeddings';

const item = { contentRevision: 1, pageId: 1, position: 0, text: 'Chunk text' };

describe('embedding worker message guards', () => {
  it('accepts only valid initialize and bounded batch requests', () => {
    expect(isEmbeddingWorkerRequest({
      modelBaseUrl: 'chrome-extension://id/models/', requestId: 'request', type: 'INITIALIZE', version: 1, wasmBaseUrl: 'chrome-extension://id/wasm/',
    })).toBe(true);
    expect(isEmbeddingWorkerRequest({
      items: [item], modelId: EMBEDDING_MODEL_ID, modelRevision: EMBEDDING_MODEL_REVISION, requestId: 'request', type: 'EMBED_BATCH', version: 1,
    })).toBe(true);
    expect(isEmbeddingWorkerRequest({
      items: Array.from({ length: EMBEDDING_BATCH_SIZE + 1 }, () => item), modelId: EMBEDDING_MODEL_ID, modelRevision: EMBEDDING_MODEL_REVISION, requestId: 'request', type: 'EMBED_BATCH', version: 1,
    })).toBe(false);
    expect(isEmbeddingWorkerRequest({ items: [item], modelId: 'other', modelRevision: EMBEDDING_MODEL_REVISION, requestId: '', type: 'EMBED_BATCH', version: 1 })).toBe(false);
  });

  it('validates every response variant and vector payload', () => {
    expect(isEmbeddingWorkerResponse({ requestId: 'request', status: 'ready', type: 'STATUS', version: 1 })).toBe(true);
    expect(isEmbeddingWorkerResponse({ errorCode: 'MODEL_LOAD_FAILED', message: 'safe code only', requestId: 'request', type: 'ERROR', version: 1 })).toBe(true);
    expect(isEmbeddingWorkerResponse({ errorCode: 'anything', message: 'bad', requestId: 'request', type: 'ERROR', version: 1 })).toBe(false);
    expect(isEmbeddingWorkerResponse({
      dimension: EMBEDDING_DIMENSION,
      modelId: EMBEDDING_MODEL_ID,
      modelRevision: EMBEDDING_MODEL_REVISION,
      requestId: 'request',
      results: [{ ...item, embedding: new Float32Array(EMBEDDING_DIMENSION), ok: true }],
      type: 'BATCH_RESULT',
      version: 1,
    })).toBe(true);
    expect(isEmbeddingWorkerResponse({ requestId: '', status: 'ready', type: 'STATUS', version: 1 })).toBe(false);
  });
});

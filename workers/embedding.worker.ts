import { env, pipeline } from '@huggingface/transformers';
import {
  isEmbeddingWorkerRequest,
  type EmbeddingWorkerRequest,
  type EmbeddingWorkerResult,
  type EmbeddingWorkItem,
} from '../lib/embedding-messages';
import {
  EMBEDDING_DIMENSION,
  EMBEDDING_MODEL_DTYPE,
  EMBEDDING_MODEL_ID,
  EMBEDDING_MODEL_REVISION,
  normalizeEmbedding,
} from '../lib/embeddings';
import { configureEmbeddingRuntime } from '../lib/embedding-runtime';

type FeatureExtractor = (
  texts: string[],
  options: { normalize: true; pooling: 'mean' },
) => Promise<{ data: Float32Array; dims: number[] }>;

let extractorPromise: Promise<FeatureExtractor> | undefined;

function post(message: unknown, transfer: Transferable[] = []) {
  (globalThis as unknown as { postMessage: (value: unknown, transfer?: Transferable[]) => void }).postMessage(message, transfer);
}

async function getExtractor(request: Extract<EmbeddingWorkerRequest, { type: 'INITIALIZE' }>) {
  if (!extractorPromise) {
    configureEmbeddingRuntime(env, request.modelBaseUrl, request.wasmBaseUrl);
    extractorPromise = pipeline('feature-extraction', EMBEDDING_MODEL_ID, {
      device: 'wasm',
      dtype: EMBEDDING_MODEL_DTYPE,
      revision: EMBEDDING_MODEL_REVISION,
    }) as Promise<FeatureExtractor>;
  }

  return extractorPromise;
}

async function embedOne(extractor: FeatureExtractor, item: EmbeddingWorkItem): Promise<EmbeddingWorkerResult> {
  if (!item.text.trim()) {
    return { ...item, errorCode: 'INVALID_TEXT', message: 'Chunk text is empty.', ok: false };
  }

  try {
    const output = await extractor([item.text], { normalize: true, pooling: 'mean' });
    if (output.dims.length !== 2 || output.dims[0] !== 1 || output.dims[1] !== EMBEDDING_DIMENSION) {
      return { ...item, errorCode: 'INVALID_DIMENSION', message: 'Model returned an unexpected embedding dimension.', ok: false };
    }

    return { ...item, embedding: normalizeEmbedding(new Float32Array(output.data)), ok: true };
  } catch {
    return { ...item, errorCode: 'INFERENCE_FAILED', message: 'Embedding generation failed for this chunk.', ok: false };
  }
}

async function embedBatch(extractor: FeatureExtractor, items: EmbeddingWorkItem[]): Promise<EmbeddingWorkerResult[]> {
  try {
    const output = await extractor(items.map((item) => item.text), { normalize: true, pooling: 'mean' });
    if (output.dims.length !== 2 || output.dims[0] !== items.length || output.dims[1] !== EMBEDDING_DIMENSION) {
      throw new Error('Invalid embedding dimensions.');
    }

    return items.map((item, index) => {
      const start = index * EMBEDDING_DIMENSION;
      const embedding = normalizeEmbedding(new Float32Array(output.data.slice(start, start + EMBEDDING_DIMENSION)));
      return { ...item, embedding, ok: true };
    });
  } catch {
    return Promise.all(items.map((item) => embedOne(extractor, item)));
  }
}

self.onmessage = async (event: MessageEvent<unknown>) => {
  if (!isEmbeddingWorkerRequest(event.data)) {
    post({
      errorCode: 'INVALID_REQUEST',
      message: 'Embedding worker received an invalid request.',
      requestId: 'unknown',
      type: 'ERROR',
      version: 1,
    });
    return;
  }

  const request = event.data;
  if (request.type === 'INITIALIZE') {
    post({ requestId: request.requestId, status: 'loading-model', type: 'STATUS', version: 1 });
    try {
      await getExtractor(request);
      post({ requestId: request.requestId, status: 'ready', type: 'STATUS', version: 1 });
    } catch (error) {
      extractorPromise = undefined;
      console.error('Local embedding model initialization failed.', error);
      post({
        errorCode: 'MODEL_LOAD_FAILED',
        message: 'The local embedding model could not be loaded.',
        requestId: request.requestId,
        type: 'ERROR',
        version: 1,
      });
    }
    return;
  }

  if (!extractorPromise) {
    post({
      errorCode: 'MODEL_LOAD_FAILED',
      message: 'The embedding model is not initialized.',
      requestId: request.requestId,
      type: 'ERROR',
      version: 1,
    });
    return;
  }

  try {
    const results = await embedBatch(await extractorPromise, request.items);
    const buffers = results.flatMap((result) => (
      result.ok && result.embedding.buffer instanceof ArrayBuffer ? [result.embedding.buffer] : []
    ));
    post({
      dimension: EMBEDDING_DIMENSION,
      modelId: EMBEDDING_MODEL_ID,
      modelRevision: EMBEDDING_MODEL_REVISION,
      requestId: request.requestId,
      results,
      type: 'BATCH_RESULT',
      version: 1,
    }, buffers);
  } catch {
    post({
      errorCode: 'WORKER_FAILED',
      message: 'The embedding worker could not process this batch.',
      requestId: request.requestId,
      type: 'ERROR',
      version: 1,
    });
  }
};

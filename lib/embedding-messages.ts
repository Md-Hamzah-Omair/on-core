import {
  EMBEDDING_DIMENSION,
  EMBEDDING_MODEL_ID,
  EMBEDDING_MODEL_REVISION,
  type EmbeddingErrorCode,
} from './embeddings';

export const EMBEDDING_PROTOCOL_VERSION = 1;
export const EMBEDDING_BATCH_SIZE = 8;

export interface EmbeddingWorkItem {
  contentRevision: number;
  pageId: number;
  position: number;
  text: string;
}

export type EmbeddingWorkerRequest =
  | { modelBaseUrl: string; requestId: string; type: 'INITIALIZE'; version: 1; wasmBaseUrl: string }
  | { items: EmbeddingWorkItem[]; modelId: typeof EMBEDDING_MODEL_ID; modelRevision: typeof EMBEDDING_MODEL_REVISION; requestId: string; type: 'EMBED_BATCH'; version: 1 }
  | { modelId: typeof EMBEDDING_MODEL_ID; modelRevision: typeof EMBEDDING_MODEL_REVISION; requestId: string; text: string; type: 'EMBED_QUERY'; version: 1 };

export type EmbeddingWorkerResult =
  | { contentRevision: number; embedding: Float32Array; ok: true; pageId: number; position: number }
  | { contentRevision: number; errorCode: EmbeddingErrorCode; message: string; ok: false; pageId: number; position: number };

export type EmbeddingWorkerResponse =
  | { requestId: string; status: 'loading-model' | 'ready'; type: 'STATUS'; version: 1 }
  | { dimension: typeof EMBEDDING_DIMENSION; modelId: typeof EMBEDDING_MODEL_ID; modelRevision: typeof EMBEDDING_MODEL_REVISION; requestId: string; results: EmbeddingWorkerResult[]; type: 'BATCH_RESULT'; version: 1 }
  | { dimension: typeof EMBEDDING_DIMENSION; embedding: Float32Array; modelId: typeof EMBEDDING_MODEL_ID; modelRevision: typeof EMBEDDING_MODEL_REVISION; requestId: string; type: 'QUERY_RESULT'; version: 1 }
  | { errorCode: EmbeddingErrorCode; message: string; requestId: string; type: 'ERROR'; version: 1 };

function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function isWorkItem(value: unknown): value is EmbeddingWorkItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.contentRevision === 'number' && Number.isInteger(item.contentRevision) && item.contentRevision > 0
    && typeof item.pageId === 'number' && Number.isInteger(item.pageId) && item.pageId > 0
    && typeof item.position === 'number' && Number.isInteger(item.position) && item.position >= 0
    && typeof item.text === 'string' && item.text.trim().length > 0;
}

export function isEmbeddingErrorCode(value: unknown): value is EmbeddingErrorCode {
  return value === 'INVALID_REQUEST' || value === 'INVALID_TEXT' || value === 'MODEL_LOAD_FAILED'
    || value === 'INFERENCE_FAILED' || value === 'INVALID_DIMENSION' || value === 'INVALID_VECTOR' || value === 'WORKER_FAILED';
}

function isResult(value: unknown): value is EmbeddingWorkerResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return isWorkItem(result) && (result.ok === true ? result.embedding instanceof Float32Array : result.ok === false && isEmbeddingErrorCode(result.errorCode) && typeof result.message === 'string');
}

export function isEmbeddingWorkerRequest(value: unknown): value is EmbeddingWorkerRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  if (request.version !== 1 || !isRequestId(request.requestId)) return false;
  if (request.type === 'INITIALIZE') return typeof request.modelBaseUrl === 'string' && typeof request.wasmBaseUrl === 'string';
  if (request.type === 'EMBED_QUERY') return request.modelId === EMBEDDING_MODEL_ID && request.modelRevision === EMBEDDING_MODEL_REVISION && typeof request.text === 'string' && request.text.trim().length > 0;
  return request.type === 'EMBED_BATCH' && request.modelId === EMBEDDING_MODEL_ID && request.modelRevision === EMBEDDING_MODEL_REVISION && Array.isArray(request.items) && request.items.length > 0 && request.items.length <= EMBEDDING_BATCH_SIZE && request.items.every(isWorkItem);
}

export function isEmbeddingWorkerResponse(value: unknown): value is EmbeddingWorkerResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Record<string, unknown>;
  if (response.version !== 1 || !isRequestId(response.requestId)) return false;
  if (response.type === 'STATUS') return response.status === 'loading-model' || response.status === 'ready';
  if (response.type === 'ERROR') return isEmbeddingErrorCode(response.errorCode) && typeof response.message === 'string';
  if (response.type === 'QUERY_RESULT') return response.dimension === EMBEDDING_DIMENSION && response.modelId === EMBEDDING_MODEL_ID && response.modelRevision === EMBEDDING_MODEL_REVISION && response.embedding instanceof Float32Array;
  return response.type === 'BATCH_RESULT' && response.dimension === EMBEDDING_DIMENSION && response.modelId === EMBEDDING_MODEL_ID && response.modelRevision === EMBEDDING_MODEL_REVISION && Array.isArray(response.results) && response.results.length > 0 && response.results.length <= EMBEDDING_BATCH_SIZE && response.results.every(isResult);
}

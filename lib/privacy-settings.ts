import {
  EMBEDDING_DIMENSION,
  EMBEDDING_MODEL_ID,
  EMBEDDING_MODEL_REVISION,
  EMBEDDING_VERSION,
} from './embeddings';

export interface LocalDataSummary {
  chunkCount: number;
  chunkStatuses: Record<'failed' | 'indexed' | 'indexing' | 'pending', number>;
  pageCount: number;
  pageStatuses: Record<'failed' | 'indexed' | 'indexing' | 'pending', number>;
}

export const LOCAL_RUNTIME_DETAILS = {
  dimension: EMBEDDING_DIMENSION,
  embeddingVersion: EMBEDDING_VERSION,
  modelId: EMBEDDING_MODEL_ID,
  modelRevision: EMBEDDING_MODEL_REVISION,
  runtime: 'Transformers.js with ONNX Runtime Web, CPU/WASM, single-threaded',
} as const;

export function formatStorageEstimate(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return 'Storage estimate unavailable';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

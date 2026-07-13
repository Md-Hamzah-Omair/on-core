export const EMBEDDING_DIMENSION = 384;
export const EMBEDDING_MODEL_DTYPE = 'int8';
export const EMBEDDING_MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_MODEL_REVISION = '751bff37182d3f1213fa05d7196b954e230abad9';
export const EMBEDDING_VERSION = 1;

export type EmbeddingErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_TEXT'
  | 'MODEL_LOAD_FAILED'
  | 'INFERENCE_FAILED'
  | 'INVALID_DIMENSION'
  | 'INVALID_VECTOR'
  | 'WORKER_FAILED';

export interface EmbeddingMetadata {
  embeddingDimension: number;
  embeddingModelId: string;
  embeddingModelRevision: string;
  embeddingVersion: number;
}

export const CURRENT_EMBEDDING_METADATA: EmbeddingMetadata = {
  embeddingDimension: EMBEDDING_DIMENSION,
  embeddingModelId: EMBEDDING_MODEL_ID,
  embeddingModelRevision: EMBEDDING_MODEL_REVISION,
  embeddingVersion: EMBEDDING_VERSION,
};

export function normalizeEmbedding(vector: Float32Array): Float32Array {
  if (vector.length !== EMBEDDING_DIMENSION) {
    throw new RangeError(`Expected ${EMBEDDING_DIMENSION} embedding values.`);
  }

  let sumOfSquares = 0;
  for (const value of vector) {
    if (!Number.isFinite(value)) throw new TypeError('Embedding values must be finite.');
    sumOfSquares += value * value;
  }

  const magnitude = Math.sqrt(sumOfSquares);
  if (magnitude === 0) throw new TypeError('Embedding vectors must not be zero.');

  const normalized = new Float32Array(vector.length);
  for (let index = 0; index < vector.length; index += 1) {
    normalized[index] = vector[index] / magnitude;
  }

  return normalized;
}

export function isCurrentEmbeddingMetadata(metadata: Partial<EmbeddingMetadata>): boolean {
  return (
    metadata.embeddingDimension === EMBEDDING_DIMENSION
    && metadata.embeddingModelId === EMBEDDING_MODEL_ID
    && metadata.embeddingModelRevision === EMBEDDING_MODEL_REVISION
    && metadata.embeddingVersion === EMBEDDING_VERSION
  );
}

export function isValidEmbedding(vector: unknown): vector is Float32Array {
  if (!(vector instanceof Float32Array) || vector.length !== EMBEDDING_DIMENSION) return false;

  try {
    let magnitude = 0;
    for (const value of vector) {
      if (!Number.isFinite(value)) return false;
      magnitude += value * value;
    }
    return Math.abs(Math.sqrt(magnitude) - 1) < 0.0001;
  } catch {
    return false;
  }
}

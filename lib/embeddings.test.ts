import { describe, expect, it } from 'vitest';
import {
  CURRENT_EMBEDDING_METADATA,
  EMBEDDING_DIMENSION,
  EMBEDDING_MODEL_ID,
  EMBEDDING_MODEL_REVISION,
  EMBEDDING_VERSION,
  isCurrentEmbeddingMetadata,
  isValidEmbedding,
  normalizeEmbedding,
} from './embeddings';

function unitVector(): Float32Array {
  const vector = new Float32Array(EMBEDDING_DIMENSION);
  vector[0] = 1;
  return vector;
}

describe('embedding helpers', () => {
  it('defines the pinned model metadata', () => {
    expect(EMBEDDING_MODEL_ID).toBe('Xenova/all-MiniLM-L6-v2');
    expect(EMBEDDING_MODEL_REVISION).toBe('751bff37182d3f1213fa05d7196b954e230abad9');
    expect(EMBEDDING_VERSION).toBe(1);
    expect(CURRENT_EMBEDDING_METADATA.embeddingDimension).toBe(384);
  });

  it('accepts only finite, unit-normalized 384-dimensional vectors', () => {
    expect(isValidEmbedding(unitVector())).toBe(true);
    expect(isValidEmbedding(new Float32Array(EMBEDDING_DIMENSION))).toBe(false);
    expect(isValidEmbedding(new Float32Array(EMBEDDING_DIMENSION - 1))).toBe(false);
    const nonUnit = unitVector();
    nonUnit[0] = 2;
    expect(isValidEmbedding(nonUnit)).toBe(false);
    const nonFinite = unitVector();
    nonFinite[0] = Number.NaN;
    expect(isValidEmbedding(nonFinite)).toBe(false);
  });

  it('normalizes valid vectors and matches only current metadata', () => {
    const vector = unitVector();
    vector[0] = 3;
    expect(normalizeEmbedding(vector)[0]).toBeCloseTo(1);
    expect(isCurrentEmbeddingMetadata(CURRENT_EMBEDDING_METADATA)).toBe(true);
    expect(isCurrentEmbeddingMetadata({ ...CURRENT_EMBEDDING_METADATA, embeddingVersion: 2 })).toBe(false);
  });
});

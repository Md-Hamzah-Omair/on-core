import { describe, expect, it } from 'vitest';
import { CURRENT_EMBEDDING_METADATA, EMBEDDING_DIMENSION } from './embeddings';
import { derivePageIndexingState, isChunkIndexed } from './indexing';

function indexedChunk() {
  const embedding = new Float32Array(EMBEDDING_DIMENSION);
  embedding[0] = 1;
  return { contentRevision: 1, embedding, embeddingStatus: 'indexed' as const, ...CURRENT_EMBEDDING_METADATA };
}

describe('indexing state derivation', () => {
  it('only marks every valid current chunk as indexed', () => {
    const chunk = indexedChunk();
    expect(isChunkIndexed(chunk, 1)).toBe(true);
    expect(derivePageIndexingState([chunk], 1)).toMatchObject({ indexedChunkCount: 1, indexingStatus: 'indexed' });
    expect(derivePageIndexingState([{ ...chunk, embedding: undefined }], 1)).toMatchObject({ indexedChunkCount: 0, indexingStatus: 'pending' });
  });

  it('keeps partial failures and empty pages truthful', () => {
    expect(derivePageIndexingState([], 1)).toMatchObject({ indexingStatus: 'failed', indexingPhase: null });
    expect(derivePageIndexingState([indexedChunk(), { contentRevision: 1, embeddingStatus: 'failed' }], 1)).toMatchObject({ indexedChunkCount: 1, indexingStatus: 'failed' });
    expect(derivePageIndexingState([{ contentRevision: 1, embeddingStatus: 'indexing' }], 1)).toMatchObject({ indexingStatus: 'indexing', indexingPhase: 'embedding' });
  });
});

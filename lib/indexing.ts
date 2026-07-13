import { isCurrentEmbeddingMetadata, isValidEmbedding, type EmbeddingMetadata } from './embeddings';

export type IndexingPhase = 'queued' | 'loading-model' | 'embedding' | null;
export type IndexingStatus = 'pending' | 'indexing' | 'indexed' | 'failed';

export interface IndexingChunkState extends Partial<EmbeddingMetadata> {
  contentRevision: number;
  embedding?: Float32Array;
  embeddingStatus: IndexingStatus;
}

export interface PageIndexingState {
  indexedChunkCount: number;
  indexingPhase: IndexingPhase;
  indexingStatus: IndexingStatus;
}

export function isChunkIndexed(chunk: IndexingChunkState, contentRevision: number): boolean {
  return (
    chunk.contentRevision === contentRevision
    && chunk.embeddingStatus === 'indexed'
    && isCurrentEmbeddingMetadata(chunk)
    && isValidEmbedding(chunk.embedding)
  );
}

export function derivePageIndexingState(
  chunks: IndexingChunkState[],
  contentRevision: number,
): PageIndexingState {
  const indexedChunkCount = chunks.filter((chunk) => isChunkIndexed(chunk, contentRevision)).length;
  if (chunks.length === 0) {
    return { indexedChunkCount, indexingPhase: null, indexingStatus: 'failed' };
  }

  if (indexedChunkCount === chunks.length) {
    return { indexedChunkCount, indexingPhase: null, indexingStatus: 'indexed' };
  }

  if (chunks.some((chunk) => chunk.embeddingStatus === 'indexing')) {
    return { indexedChunkCount, indexingPhase: 'embedding', indexingStatus: 'indexing' };
  }

  if (chunks.some((chunk) => chunk.embeddingStatus === 'failed')) {
    return { indexedChunkCount, indexingPhase: null, indexingStatus: 'failed' };
  }

  return { indexedChunkCount, indexingPhase: 'queued', indexingStatus: 'pending' };
}

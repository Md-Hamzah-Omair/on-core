import { EMBEDDING_DIMENSION } from '../embeddings';
import type { SemanticSearchCandidate } from '../semantic-search';

export const HYBRID_NOW = Date.UTC(2026, 0, 1);

export function rankingVector(first: number, second = 0): Float32Array {
  const vector = new Float32Array(EMBEDDING_DIMENSION);
  const magnitude = Math.hypot(first, second);
  vector[0] = first / magnitude;
  vector[1] = second / magnitude;
  return vector;
}

export const HYBRID_RANKING_FIXTURE: SemanticSearchCandidate[] = [
  { embedding: rankingVector(1), pageId: 1, position: 0, savedAt: HYBRID_NOW - 180 * 24 * 60 * 60 * 1000, text: 'A detailed browser memory guide for reducing resource use.', title: 'Browser Memory Guide', url: 'https://docs.example.test/browser-memory' },
  { embedding: rankingVector(0.3, 0.95), pageId: 2, position: 0, savedAt: HYBRID_NOW, text: 'A short memory note with little related detail.', title: 'Recent Notes', url: 'https://recent.example.test/notes' },
  { embedding: rankingVector(0.2, 0.98), pageId: 3, position: 0, savedAt: HYBRID_NOW, text: 'Generic documentation.', title: 'Domain Reference', url: 'https://developer.mozilla.org/en-US/docs/Web/API' },
  { embedding: rankingVector(0.2, 0.98), pageId: 4, position: 0, savedAt: HYBRID_NOW, text: 'Generic strict configuration documentation.', title: 'Type Rules', url: 'https://example.test/typescript/strict-mode' },
  { embedding: rankingVector(1), pageId: 5, position: 1, savedAt: HYBRID_NOW, text: 'A weaker matching passage.', title: 'Multi chunk', url: 'https://example.test/multi' },
  { embedding: rankingVector(1), pageId: 5, position: 0, savedAt: HYBRID_NOW, text: 'Browser memory guide gives the best matching passage.', title: 'Multi chunk', url: 'https://example.test/multi' },
  { embedding: rankingVector(1), pageId: 6, position: 0, savedAt: Number.NaN, text: 'Browser memory guide.', title: 'Malformed date', url: 'https://example.test/date' },
  { embedding: new Float32Array(EMBEDDING_DIMENSION), pageId: 7, position: 0, savedAt: HYBRID_NOW, text: 'Browser memory guide.', title: 'Invalid embedding', url: 'https://example.test/invalid' },
];

export const HYBRID_EXPECTED_PAGE_ORDER = [1, 5, 6, 2];

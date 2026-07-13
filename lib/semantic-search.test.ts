import { describe, expect, it } from 'vitest';
import {
  createSearchSnippet,
  cosineSimilarity,
  normalizedDotProduct,
  rankSemanticSearch,
  validateSearchQuery,
} from './semantic-search';
import { EMBEDDING_DIMENSION } from './embeddings';

function vector(first: number, second = 0): Float32Array {
  const result = new Float32Array(EMBEDDING_DIMENSION);
  result[0] = first;
  result[1] = second;
  const magnitude = Math.hypot(first, second);
  result[0] /= magnitude;
  result[1] /= magnitude;
  return result;
}

describe('semantic search', () => {
  it('validates queries and normalized similarity', () => {
    const valid = validateSearchQuery('  react   memoization ');
    expect(valid.valid && valid.normalized).toBe('react memoization');
    expect(validateSearchQuery('  ').valid).toBe(false);
    expect(normalizedDotProduct(vector(1), vector(1))).toBeCloseTo(1);
    expect(cosineSimilarity(vector(1), vector(0, 1))).toBeCloseTo(0);
  });

  it('groups pages, ranks deterministically, and applies the limit', () => {
    const query = vector(1);
    const results = rankSemanticSearch(query, [
      { embedding: vector(0.9, 0.1), pageId: 2, position: 1, savedAt: 1, text: 'later chunk', title: 'Two', url: 'https://two.test' },
      { embedding: vector(1), pageId: 1, position: 2, savedAt: 2, text: 'best first page', title: 'One', url: 'https://one.test' },
      { embedding: vector(1), pageId: 1, position: 0, savedAt: 2, text: 'tie winner', title: 'One', url: 'https://one.test' },
    ], 1);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ pageId: 1, position: 0, snippet: 'tie winner' });
  });

  it('builds readable snippets without lexical highlighting', () => {
    expect(createSearchSnippet('word '.repeat(100))).toMatch(/\.\.\.$/);
    expect(createSearchSnippet('short semantic passage')).toBe('short semantic passage');
  });
});

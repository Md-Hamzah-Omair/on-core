import { describe, expect, it } from 'vitest';
import { HYBRID_EXPECTED_PAGE_ORDER, HYBRID_NOW, HYBRID_RANKING_FIXTURE, rankingVector } from './fixtures/hybrid-ranking';
import {
  DEFAULT_HYBRID_WEIGHTS,
  DEFAULT_SEARCH_RESULT_LIMIT,
  RECENCY_HALF_LIFE_MS,
  createSearchSnippet,
  cosineSimilarity,
  normalizeLexicalTokens,
  normalizedDotProduct,
  rankSemanticSearch,
  recencyScore,
  validateHybridWeights,
  validateSearchQuery,
  type SemanticSearchCandidate,
} from './semantic-search';
import { EMBEDDING_DIMENSION } from './embeddings';

describe('hybrid semantic search', () => {
  it('defaults to three results', () => {
    expect(DEFAULT_SEARCH_RESULT_LIMIT).toBe(3);
  });
  it('normalizes semantic queries and lexical tokens deterministically', () => {
    const valid = validateSearchQuery('  React—Memoization, react  ');
    expect(valid.valid && valid.normalized).toBe('React—Memoization, react');
    expect(normalizeLexicalTokens('  React—Memoization, react  ')).toEqual(['react', 'memoization']);
    expect(validateSearchQuery('!!! a !').valid).toBe(false);
    expect(validateSearchQuery('the and of').valid).toBe(true);
  });

  it('keeps conceptual semantic matches discoverable without lexical terms', () => {
    const results = rankSemanticSearch(rankingVector(1), 'unrelated wording', [{
      embedding: rankingVector(1), pageId: 1, position: 0, savedAt: HYBRID_NOW,
      text: 'Different words entirely.', title: 'Conceptual match', url: 'https://example.test/concept',
    }], 10, HYBRID_NOW);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeCloseTo(0.75);
  });

  it('boosts exact title phrases, hostnames, and URL tokens', () => {
    const candidates: SemanticSearchCandidate[] = [
      { embedding: rankingVector(0.3, 0.95), pageId: 1, position: 0, savedAt: HYBRID_NOW, text: 'No matching words.', title: 'React Server Components Guide', url: 'https://example.test/react' },
      { embedding: rankingVector(0.3, 0.95), pageId: 2, position: 0, savedAt: HYBRID_NOW, text: 'No matching words.', title: 'Other', url: 'https://developer.mozilla.org/docs' },
      { embedding: rankingVector(0.3, 0.95), pageId: 3, position: 0, savedAt: HYBRID_NOW, text: 'No matching words.', title: 'Other', url: 'https://example.test/typescript/strict-mode' },
    ];
    expect(rankSemanticSearch(rankingVector(0.3, 0.95), 'react server components', candidates, 10, HYBRID_NOW)[0].pageId).toBe(1);
    expect(rankSemanticSearch(rankingVector(0.3, 0.95), 'developer mozilla', candidates, 10, HYBRID_NOW)[0].pageId).toBe(2);
    expect(rankSemanticSearch(rankingVector(0.3, 0.95), 'strict mode', candidates, 10, HYBRID_NOW)[0].pageId).toBe(3);
  });

  it('applies bounded frequency, length normalization, and duplicate query terms', () => {
    const query = rankingVector(0.3, 0.95);
    const repeated = { embedding: query, pageId: 1, position: 0, savedAt: HYBRID_NOW, text: 'memory '.repeat(400), title: 'Memory', url: 'https://example.test' };
    const concise = { ...repeated, pageId: 2, text: 'memory guide', title: 'Memory guide' };
    const duplicate = rankSemanticSearch(query, 'memory memory guide', [concise], 10, HYBRID_NOW);
    const unique = rankSemanticSearch(query, 'memory guide', [concise], 10, HYBRID_NOW);
    expect(duplicate[0].score).toBeCloseTo(unique[0].score);
    expect(rankSemanticSearch(query, 'memory guide', [concise, repeated], 10, HYBRID_NOW)[0].pageId).toBe(2);
  });

  it('uses a modest 90-day recency decay and cannot rank an irrelevant page alone', () => {
    expect(recencyScore(HYBRID_NOW - RECENCY_HALF_LIFE_MS, HYBRID_NOW)).toBeCloseTo(0.5);
    expect(recencyScore(HYBRID_NOW + 1, HYBRID_NOW)).toBe(0);
    expect(recencyScore(Number.NaN, HYBRID_NOW)).toBe(0);
    expect(rankSemanticSearch(rankingVector(0, 1), 'missing terms', [{
      embedding: rankingVector(-1), pageId: 9, position: 0, savedAt: HYBRID_NOW, text: 'No overlap.', title: 'No overlap', url: 'https://example.test',
    }], 10, HYBRID_NOW)).toEqual([]);
  });

  it('keeps older strong matches above recent weak matches and groups the best chunk', () => {
    const results = rankSemanticSearch(rankingVector(1), 'browser memory guide', HYBRID_RANKING_FIXTURE, 10, HYBRID_NOW);
    expect(results.map((result) => result.pageId)).toEqual(HYBRID_EXPECTED_PAGE_ORDER);
    expect(results.find((result) => result.pageId === 5)).toMatchObject({ position: 0 });
  });

  it('normalizes scores, rejects invalid embeddings before the page cap, and has deterministic ties', () => {
    const invalid = Array.from({ length: 512 }, (_, position) => ({
      embedding: new Float32Array(EMBEDDING_DIMENSION), pageId: 1, position, savedAt: HYBRID_NOW, text: 'invalid', title: 'Invalid', url: 'https://invalid.test',
    }));
    const valid = { embedding: rankingVector(1), pageId: 1, position: 999, savedAt: HYBRID_NOW, text: 'conceptual content', title: 'Valid', url: 'https://valid.test' };
    const tied = [
      { ...valid, pageId: 3, position: 0, title: 'Tie' },
      { ...valid, pageId: 2, position: 0, title: 'Tie' },
    ];
    const results = rankSemanticSearch(rankingVector(1), 'conceptual', [...invalid, valid, ...tied], 10, HYBRID_NOW);
    expect(results[0].pageId).toBe(1);
    expect(results.every((result) => result.score >= 0 && result.score <= 1)).toBe(true);
    expect(rankSemanticSearch(rankingVector(1), 'conceptual', tied, 10, HYBRID_NOW).map((result) => result.pageId)).toEqual([2, 3]);
  });

  it('uses configurable weights and validates score inputs', () => {
    validateHybridWeights(DEFAULT_HYBRID_WEIGHTS);
    expect(() => validateHybridWeights({ semantic: 0.7, lexical: 0.25, recency: 0.1 })).toThrow(RangeError);
    const candidate = { embedding: rankingVector(1), pageId: 1, position: 0, savedAt: HYBRID_NOW, text: 'conceptual text', title: 'Conceptual', url: 'https://example.test' };
    const result = rankSemanticSearch(rankingVector(1), 'conceptual', [candidate], 10, HYBRID_NOW, { semantic: 0.5, lexical: 0.4, recency: 0.1 });
    expect(result[0].score).toBeGreaterThan(0.5);
    expect(() => rankSemanticSearch(new Float32Array(EMBEDDING_DIMENSION), 'conceptual', [candidate])).toThrow(TypeError);
    expect(normalizedDotProduct(rankingVector(1), rankingVector(1))).toBeCloseTo(1);
    expect(cosineSimilarity(rankingVector(1), rankingVector(0, 1))).toBeCloseTo(0);
  });

  it('builds readable snippets without lexical highlighting', () => {
    expect(createSearchSnippet('word '.repeat(100))).toMatch(/\.\.\.$/);
    expect(createSearchSnippet('short hybrid passage')).toBe('short hybrid passage');
  });

  it('returns the snippet from the chunk that wins page grouping', () => {
    const results = rankSemanticSearch(rankingVector(1), 'matching passage', [
      { embedding: rankingVector(0.5, 0.5), pageId: 1, position: 0, savedAt: HYBRID_NOW, text: 'weaker passage', title: 'Page title', url: 'https://example.test' },
      { embedding: rankingVector(1), pageId: 1, position: 1, savedAt: HYBRID_NOW, text: 'actual best matching passage', title: 'Page title', url: 'https://example.test' },
    ], 3, HYBRID_NOW);
    expect(results[0]).toMatchObject({ position: 1, snippet: 'actual best matching passage' });
  });
});

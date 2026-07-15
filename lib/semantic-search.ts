import { EMBEDDING_DIMENSION, isValidEmbedding } from './embeddings';

export const MIN_SEARCH_QUERY_LENGTH = 3;
export const MAX_SEARCH_QUERY_LENGTH = 500;
export const DEFAULT_SEARCH_RESULT_LIMIT = 3;
export const MAX_SEARCH_RESULT_LIMIT = 20;
export const MIN_SEMANTIC_SCORE = 0.25;
export const MIN_SINGLE_TERM_SEMANTIC_SCORE = 0.20;
export const MIN_LEXICAL_SCORE = 0.10;
export const MAX_SEARCH_CANDIDATE_CHUNKS = 20_000;
export const MAX_SEARCH_CHUNKS_PER_PAGE = 512;
export const SEARCH_SNIPPET_LENGTH = 280;
export const RECENCY_HALF_LIFE_MS = 90 * 24 * 60 * 60 * 1000;
export const DEFAULT_HYBRID_WEIGHTS = { lexical: 0.25, recency: 0.10, semantic: 0.65 } as const;

export interface HybridWeights {
  lexical: number;
  recency: number;
  semantic: number;
}

export interface SemanticSearchCandidate {
  embedding: Float32Array;
  pageId: number;
  position: number;
  savedAt: number;
  text: string;
  title: string;
  url: string;
}

export interface SemanticSearchResult {
  pageId: number;
  position: number;
  savedAt: number;
  score: number;
  snippet: string;
  title: string;
  url: string;
}

export type SearchQueryValidation =
  | { normalized: string; valid: true }
  | { message: string; valid: false };

type PageSearchData = {
  hostnameTokens: string[];
  recencyScore: number;
  savedAt: number;
  titleTokens: string[];
  urlTokens: string[];
};

type QueryTerm = {
  variants: string[];
};

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function normalizeLexicalTokens(value: string): string[] {
  return [...new Set(value.normalize('NFKC')
    .replace(/([\p{Ll}\p{N}])([\p{Lu}])/gu, '$1 $2')
    .replace(/([\p{Lu}]+)([\p{Lu}][\p{Ll}])/gu, '$1 $2')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => Array.from(token).length >= 2))];
}

function addVariant(variants: Set<string>, token: string): void {
  if (Array.from(token).length >= 2) variants.add(token);
}

function addInflectionBase(variants: Set<string>, base: string): void {
  if (Array.from(base).length >= 4) addVariant(variants, base);
  if (base.length >= 3 && base.at(-1) === base.at(-2)) {
    addVariant(variants, base.slice(0, -1));
  } else if (!base.endsWith('e')) {
    addVariant(variants, `${base}e`);
  }
}

function queryTermVariants(token: string): string[] {
  const variants = new Set([token]);
  const length = Array.from(token).length;
  if (token.endsWith('ing') && length >= 6) addInflectionBase(variants, token.slice(0, -3));
  if (token.endsWith('ied') && length >= 5) addVariant(variants, `${token.slice(0, -3)}y`);
  if (token.endsWith('ed') && length >= 5) addInflectionBase(variants, token.slice(0, -2));
  if (token.endsWith('ies') && length >= 5) addVariant(variants, `${token.slice(0, -3)}y`);
  if (token.endsWith('es') && length >= 5) addInflectionBase(variants, token.slice(0, -2));
  if (token.endsWith('s') && !token.endsWith('ss') && length >= 4) addVariant(variants, token.slice(0, -1));
  return [...variants];
}

function queryTerms(tokens: string[]): QueryTerm[] {
  return tokens.map((token) => ({ variants: queryTermVariants(token) }));
}

export function validateSearchQuery(value: unknown): SearchQueryValidation {
  if (typeof value !== 'string') return { message: 'Enter a search query.', valid: false };
  const normalized = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
  const length = Array.from(normalized).length;
  if (length < MIN_SEARCH_QUERY_LENGTH) return { message: 'Enter at least 3 characters to search.', valid: false };
  if (length > MAX_SEARCH_QUERY_LENGTH) return { message: 'Search queries must be 500 characters or fewer.', valid: false };
  if (normalizeLexicalTokens(normalized).length === 0) return { message: 'Enter at least one meaningful search term.', valid: false };
  return { normalized, valid: true };
}

export function validateSearchResultLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_SEARCH_RESULT_LIMIT;
}

export function validateHybridWeights(weights: HybridWeights): void {
  const values = [weights.semantic, weights.lexical, weights.recency];
  if (values.some((value) => !Number.isFinite(value) || value < 0) || Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 1e-9) {
    throw new RangeError('Hybrid search weights must be finite, non-negative, and sum to 1.');
  }
}

export function dotProduct(left: Float32Array, right: Float32Array): number {
  if (left.length !== right.length || left.length !== EMBEDDING_DIMENSION) throw new RangeError('Embedding dimensions must match.');
  let score = 0;
  for (let index = 0; index < left.length; index += 1) score += left[index] * right[index];
  return score;
}

export function cosineSimilarity(left: Float32Array, right: Float32Array): number {
  if (left.length !== right.length || left.length !== EMBEDDING_DIMENSION) throw new RangeError('Embedding dimensions must match.');
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (!Number.isFinite(left[index]) || !Number.isFinite(right[index])) throw new TypeError('Embedding values must be finite.');
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) throw new TypeError('Embedding vectors must not be zero.');
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

export function normalizedDotProduct(left: Float32Array, right: Float32Array): number {
  if (!isValidEmbedding(left) || !isValidEmbedding(right)) throw new TypeError('Embeddings must be valid normalized vectors.');
  return Math.max(-1, Math.min(1, dotProduct(left, right)));
}

function titlePartialMatch(term: QueryTerm, fieldTokens: string[]): boolean {
  return term.variants.some((variant) => Array.from(variant).length >= 4
    && fieldTokens.some((token) => token !== variant && token.endsWith(variant)));
}

function fieldScore(query: QueryTerm[], fieldTokens: string[], referenceLength: number, allowTitlePartial = false): number {
  if (fieldTokens.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const token of fieldTokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  let coverageTotal = 0;
  let frequencyTotal = 0;
  for (const term of query) {
    const count = Math.max(...term.variants.map((variant) => counts.get(variant) ?? 0));
    if (count > 0) {
      coverageTotal += 1;
      frequencyTotal += Math.min(count, 3) / 3;
    } else if (allowTitlePartial && titlePartialMatch(term, fieldTokens)) {
      coverageTotal += 0.65;
      frequencyTotal += 0.2;
    }
  }
  const coverage = coverageTotal / query.length;
  const frequency = frequencyTotal / query.length;
  const lengthPenalty = Math.min(1, referenceLength / Math.max(referenceLength, fieldTokens.length));
  return coverage * (0.8 + 0.2 * frequency) * lengthPenalty;
}

function hasTokenPhrase(tokens: string[], phrase: string[]): boolean {
  if (phrase.length < 2 || phrase.length > tokens.length) return false;
  return tokens.some((_, start) => phrase.every((token, index) => tokens[start + index] === token));
}

function urlTokens(url: string): { hostnameTokens: string[]; urlTokens: string[] } {
  try {
    const parsed = new URL(url);
    let pathAndQuery = `${parsed.pathname} ${parsed.search}`;
    try { pathAndQuery = decodeURIComponent(pathAndQuery); } catch { /* Keep encoded URL text. */ }
    return { hostnameTokens: normalizeLexicalTokens(parsed.hostname), urlTokens: normalizeLexicalTokens(pathAndQuery) };
  } catch {
    return { hostnameTokens: [], urlTokens: [] };
  }
}

export function recencyScore(savedAt: number, now: number): number {
  if (!Number.isFinite(savedAt) || savedAt <= 0 || !Number.isFinite(now) || now <= 0 || savedAt > now) return 0;
  return clamp(2 ** (-(now - savedAt) / RECENCY_HALF_LIFE_MS));
}

function normalizedSavedAt(savedAt: number, now: number): number {
  return Number.isFinite(savedAt) && savedAt > 0 && savedAt <= now ? savedAt : 0;
}

export function createSearchSnippet(text: string, maximumLength = SEARCH_SNIPPET_LENGTH): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const characters = Array.from(normalized);
  if (characters.length <= maximumLength) return normalized;
  const budget = maximumLength - 3;
  const minimumBoundary = Math.floor(budget * 0.6);
  let cut = budget;
  for (let index = budget - 1; index >= minimumBoundary; index -= 1) {
    if (/[.!?]/.test(characters[index])) { cut = index + 1; break; }
  }
  if (cut === budget) {
    for (let index = budget - 1; index >= minimumBoundary; index -= 1) {
      if (/\s/.test(characters[index])) { cut = index; break; }
    }
  }
  return `${characters.slice(0, cut).join('').trimEnd()}...`;
}

function compareResults(left: SemanticSearchResult & { lexicalScore: number; semanticScore: number }, right: SemanticSearchResult & { lexicalScore: number; semanticScore: number }): number {
  return right.score - left.score
    || right.semanticScore - left.semanticScore
    || right.lexicalScore - left.lexicalScore
    || right.savedAt - left.savedAt
    || left.pageId - right.pageId
    || left.position - right.position;
}

export function rankSemanticSearch(
  queryEmbedding: Float32Array,
  query: string,
  candidates: SemanticSearchCandidate[],
  limit = DEFAULT_SEARCH_RESULT_LIMIT,
  now = Date.now(),
  weights: HybridWeights = DEFAULT_HYBRID_WEIGHTS,
): SemanticSearchResult[] {
  if (!isValidEmbedding(queryEmbedding)) throw new TypeError('The query embedding is invalid.');
  if (!validateSearchResultLimit(limit)) throw new RangeError('The result limit is invalid.');
  validateHybridWeights(weights);
  const queryTokens = normalizeLexicalTokens(query);
  if (queryTokens.length === 0) throw new TypeError('The search query has no meaningful terms.');
  const terms = queryTerms(queryTokens);
  const minimumSemanticScore = terms.length === 1 ? MIN_SINGLE_TERM_SEMANTIC_SCORE : MIN_SEMANTIC_SCORE;
  const winners = new Map<number, SemanticSearchResult & { lexicalScore: number; semanticScore: number }>();
  const pageChunkCounts = new Map<number, number>();
  const pageData = new Map<number, PageSearchData>();

  for (const candidate of candidates) {
    if (!isValidEmbedding(candidate.embedding)) continue;
    const count = pageChunkCounts.get(candidate.pageId) ?? 0;
    if (count >= MAX_SEARCH_CHUNKS_PER_PAGE) continue;
    pageChunkCounts.set(candidate.pageId, count + 1);
    let page = pageData.get(candidate.pageId);
    if (!page) {
      const url = urlTokens(candidate.url);
      page = {
        ...url,
        recencyScore: recencyScore(candidate.savedAt, now),
        savedAt: normalizedSavedAt(candidate.savedAt, now),
        titleTokens: normalizeLexicalTokens(candidate.title),
      };
      pageData.set(candidate.pageId, page);
    }
    const semanticScore = clamp(normalizedDotProduct(queryEmbedding, candidate.embedding));
    const lexicalScore = clamp(
      0.45 * fieldScore(terms, page.titleTokens, 16, true)
      + 0.35 * fieldScore(terms, normalizeLexicalTokens(candidate.text), 256)
      + 0.15 * fieldScore(terms, page.hostnameTokens, 8)
      + 0.05 * fieldScore(terms, page.urlTokens, 32)
      + (hasTokenPhrase(page.titleTokens, queryTokens) ? 0.15 : 0),
    );
    if (semanticScore < minimumSemanticScore && lexicalScore < MIN_LEXICAL_SCORE) continue;
    const result = {
      lexicalScore,
      pageId: candidate.pageId,
      position: candidate.position,
      savedAt: page.savedAt,
      score: clamp(weights.semantic * semanticScore + weights.lexical * lexicalScore + weights.recency * page.recencyScore),
      semanticScore,
      snippet: createSearchSnippet(candidate.text),
      title: candidate.title,
      url: candidate.url,
    };
    const previous = winners.get(candidate.pageId);
    if (!previous || compareResults(result, previous) < 0) winners.set(candidate.pageId, result);
  }
  return [...winners.values()].sort(compareResults).slice(0, limit).map((result) => ({
    pageId: result.pageId,
    position: result.position,
    savedAt: result.savedAt,
    score: result.score,
    snippet: result.snippet,
    title: result.title,
    url: result.url,
  }));
}

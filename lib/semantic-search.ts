import { EMBEDDING_DIMENSION, isValidEmbedding } from './embeddings';

export const MIN_SEARCH_QUERY_LENGTH = 3;
export const MAX_SEARCH_QUERY_LENGTH = 500;
export const DEFAULT_SEARCH_RESULT_LIMIT = 10;
export const MAX_SEARCH_RESULT_LIMIT = 20;
export const MIN_SEMANTIC_SCORE = 0.25;
export const MAX_SEARCH_CANDIDATE_CHUNKS = 20_000;
export const MAX_SEARCH_CHUNKS_PER_PAGE = 512;
export const SEARCH_SNIPPET_LENGTH = 280;

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

export function validateSearchQuery(value: unknown): SearchQueryValidation {
  if (typeof value !== 'string') return { message: 'Enter a search query.', valid: false };
  const normalized = value.replace(/\s+/g, ' ').trim();
  const length = Array.from(normalized).length;
  if (length < MIN_SEARCH_QUERY_LENGTH) return { message: 'Enter at least 3 characters to search.', valid: false };
  if (length > MAX_SEARCH_QUERY_LENGTH) return { message: 'Search queries must be 500 characters or fewer.', valid: false };
  return { normalized, valid: true };
}

export function validateSearchResultLimit(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= 1
    && value <= MAX_SEARCH_RESULT_LIMIT;
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

export function createSearchSnippet(text: string, maximumLength = SEARCH_SNIPPET_LENGTH): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const characters = Array.from(normalized);
  if (characters.length <= maximumLength) return normalized;
  const budget = maximumLength - 3;
  const minimumBoundary = Math.floor(budget * 0.6);
  let cut = budget;
  for (let index = budget - 1; index >= minimumBoundary; index -= 1) {
    if (/[.!?]/.test(characters[index])) {
      cut = index + 1;
      break;
    }
  }
  if (cut === budget) {
    for (let index = budget - 1; index >= minimumBoundary; index -= 1) {
      if (/\s/.test(characters[index])) {
        cut = index;
        break;
      }
    }
  }
  return `${characters.slice(0, cut).join('').trimEnd()}...`;
}

export function rankSemanticSearch(
  queryEmbedding: Float32Array,
  candidates: SemanticSearchCandidate[],
  limit = DEFAULT_SEARCH_RESULT_LIMIT,
): SemanticSearchResult[] {
  if (!isValidEmbedding(queryEmbedding)) throw new TypeError('The query embedding is invalid.');
  if (!validateSearchResultLimit(limit)) throw new RangeError('The result limit is invalid.');
  const winners = new Map<number, SemanticSearchResult>();
  const pageChunkCounts = new Map<number, number>();
  for (const candidate of candidates) {
    const count = pageChunkCounts.get(candidate.pageId) ?? 0;
    if (count >= MAX_SEARCH_CHUNKS_PER_PAGE) continue;
    pageChunkCounts.set(candidate.pageId, count + 1);
    if (!isValidEmbedding(candidate.embedding)) continue;
    const score = normalizedDotProduct(queryEmbedding, candidate.embedding);
    if (score < MIN_SEMANTIC_SCORE) continue;
    const result: SemanticSearchResult = {
      pageId: candidate.pageId,
      position: candidate.position,
      savedAt: candidate.savedAt,
      score,
      snippet: createSearchSnippet(candidate.text),
      title: candidate.title,
      url: candidate.url,
    };
    const previous = winners.get(candidate.pageId);
    if (!previous || score > previous.score || (score === previous.score && candidate.position < previous.position)) winners.set(candidate.pageId, result);
  }
  return [...winners.values()]
    .sort((left, right) => right.score - left.score || right.savedAt - left.savedAt || left.pageId - right.pageId || left.position - right.position)
    .slice(0, limit);
}

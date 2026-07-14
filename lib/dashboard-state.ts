export function searchErrorMessage(code: string): string {
  if (code === 'NO_INDEXED_CONTENT') return 'No indexed pages are available yet. Save a page or wait for indexing to finish.';
  if (code === 'MODEL_LOAD_FAILED') return 'The local model could not start. Retry indexing or search again.';
  if (code === 'SEARCH_CAPACITY_EXCEEDED') return 'This local dataset is too large for the current exact search limit.';
  if (code === 'SEARCH_CANCELED') return 'Search was replaced by a newer request.';
  return 'Local search could not be completed. Please try again.';
}

export function indexingErrorMessage(code: string | undefined): string {
  if (code === 'MODEL_LOAD_FAILED') return 'The local embedding model could not be loaded.';
  if (code === 'INVALID_VECTOR') return 'An invalid local embedding was discarded. Retry indexing.';
  if (code === 'INFERENCE_FAILED') return 'Local embedding generation failed. Retry indexing.';
  return code ? 'Indexing did not complete. Retry indexing.' : '';
}

export function extractionMethodLabel(method: ExtractionMethod): string {
  if (method === 'readability') return 'Readability';
  return `${method[0].toUpperCase()}${method.slice(1)} fallback`;
}

export function articleMetadataLabel(page: Pick<SavedPage, 'byline' | 'language' | 'siteName' | 'title'>): string {
  const values = [
    page.byline ? `By ${page.byline}` : undefined,
    page.siteName && page.siteName.toLocaleLowerCase() !== page.title.toLocaleLowerCase() ? page.siteName : undefined,
    page.language,
  ].filter((value): value is string => !!value);
  return values.join(' · ');
}

export function hybridRelevanceLabel(score: number): string {
  if (score >= 0.65) return 'Strong match';
  if (score >= 0.45) return 'Good match';
  return 'Relevant match';
}

export function formatSavedDate(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Unknown save date';
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown save date';
}

export function isCurrentSearchResponse(activeRequestId: string | null, responseRequestId: string): boolean {
  return activeRequestId === responseRequestId;
}
import type { SavedPage } from './pages';
import type { ExtractionMethod } from './page-extraction';

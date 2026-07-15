import type { SearchProgressPhase } from './messages';
import type { SavedPage } from './pages';
import type { ExtractionMethod } from './page-extraction';
import type { LocalDataSummary } from './privacy-settings';

export type SavedMemoryFilter = 'all' | 'in-progress' | 'indexed' | 'failed';
export type SearchView = 'idle' | 'loading' | 'results' | 'no-results' | 'failure';

export interface IndexingPresentation {
  current: number;
  label: string;
  maximum?: number;
  percent?: number;
  retryable: boolean;
  tone: 'neutral' | 'accent' | 'success' | 'danger';
}

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
  return 'Relevant result';
}

export function relevanceExplanation(): string {
  return 'Based on semantic meaning, matched terms, source, and save recency.';
}

export function deriveSearchView(state: 'idle' | 'searching' | 'results' | 'no-results' | 'failed', resultCount: number): SearchView {
  if (state === 'searching') return 'loading';
  if (state === 'failed') return 'failure';
  if (state === 'no-results' || (state === 'results' && resultCount === 0)) return 'no-results';
  if (state === 'results') return 'results';
  return 'idle';
}

export function searchProgressLabel(phase: SearchProgressPhase): string {
  if (phase === 'loading-model') return 'Loading the bundled local model...';
  if (phase === 'embedding-query') return 'Embedding query locally...';
  if (phase === 'ranking') return 'Ranking local memories...';
  return 'Preparing local search...';
}

export function formatSearchSummary(resultCount: number, candidateChunkCount: number, elapsedMs: number): string {
  const results = Number.isInteger(resultCount) && resultCount >= 0 ? resultCount : 0;
  const chunks = Number.isInteger(candidateChunkCount) && candidateChunkCount >= 0 ? candidateChunkCount : 0;
  const elapsed = Number.isFinite(elapsedMs) && elapsedMs >= 0 ? Math.round(elapsedMs) : 0;
  return `${results} ${results === 1 ? 'result' : 'results'} · ${chunks.toLocaleString()} indexed ${chunks === 1 ? 'chunk' : 'chunks'} considered · ${elapsed.toLocaleString()} ms`;
}

export function formatSavedDate(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Unknown save date';
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown save date';
}

export function savedDateTime(timestamp: number): string | undefined {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return undefined;
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

export function safePageUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function safeHostname(value: string): string {
  const safeUrl = safePageUrl(value);
  return safeUrl ? new URL(safeUrl).hostname || 'Unknown source' : 'Unknown source';
}

export function createSavedSnippet(text: string, maximumLength = 200): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const characters = Array.from(normalized);
  if (characters.length <= maximumLength) return normalized;
  const budget = Math.max(1, maximumLength - 1);
  const minimumBoundary = Math.floor(budget * 0.6);
  let end = budget;
  for (let index = budget - 1; index >= minimumBoundary; index -= 1) {
    if (/\s/.test(characters[index])) { end = index; break; }
  }
  return `${characters.slice(0, end).join('').trimEnd()}…`;
}

export function deriveIndexingPresentation(page: Pick<SavedPage, 'chunkCount' | 'indexedChunkCount' | 'indexingPhase' | 'indexingStatus'>): IndexingPresentation {
  const maximum = Number.isInteger(page.chunkCount) && page.chunkCount > 0 ? page.chunkCount : undefined;
  const current = maximum && Number.isFinite(page.indexedChunkCount)
    ? Math.min(maximum, Math.max(0, Math.trunc(page.indexedChunkCount)))
    : 0;
  const percent = maximum ? Math.round((current / maximum) * 100) : undefined;
  if (page.indexingStatus === 'indexed') return { current: maximum ?? current, label: 'Indexed', maximum, percent: maximum ? 100 : undefined, retryable: false, tone: 'success' };
  if (page.indexingStatus === 'failed') return { current, label: 'Indexing failed', maximum, percent, retryable: true, tone: 'danger' };
  if (page.indexingPhase === 'loading-model') return { current, label: 'Loading local model', retryable: false, tone: 'accent' };
  if (page.indexingStatus === 'indexing' || page.indexingPhase === 'embedding') return { current, label: 'Embedding chunks', maximum, percent, retryable: false, tone: 'accent' };
  return { current, label: 'Queued for local indexing', maximum, percent, retryable: false, tone: 'neutral' };
}

export function filterSavedPages(pages: SavedPage[], filter: SavedMemoryFilter): SavedPage[] {
  if (filter === 'all') return pages;
  if (filter === 'in-progress') return pages.filter((page) => page.indexingStatus === 'pending' || page.indexingStatus === 'indexing');
  return pages.filter((page) => page.indexingStatus === filter);
}

export function settingsSummary(summary: LocalDataSummary | null): string {
  if (!summary) return 'Local storage summary unavailable';
  return `${summary.pageCount.toLocaleString()} saved ${summary.pageCount === 1 ? 'page' : 'pages'} · ${summary.chunkStatuses.indexed.toLocaleString()} indexed ${summary.chunkStatuses.indexed === 1 ? 'chunk' : 'chunks'}`;
}

export function isCurrentSearchResponse(activeRequestId: string | null, responseRequestId: string): boolean {
  return activeRequestId === responseRequestId;
}

export function isCurrentSearchProgress(activeRequestId: string | null, progressRequestId: string): boolean {
  return activeRequestId === progressRequestId;
}

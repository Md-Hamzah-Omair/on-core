import { describe, expect, it } from 'vitest';
import {
  articleMetadataLabel, createSavedSnippet, deriveIndexingPresentation, deriveSearchView, extractionMethodLabel,
  filterSavedPages, formatSavedDate, formatSearchSummary, hybridRelevanceLabel,
  indexingErrorMessage, isCurrentSearchProgress, isCurrentSearchResponse, safeHostname,
  relevanceExplanation, safePageUrl, searchErrorMessage, searchProgressLabel, settingsSummary,
} from './dashboard-state';
import type { SavedPage } from './pages';

function page(status: SavedPage['indexingStatus'], overrides: Partial<SavedPage> = {}): SavedPage {
  return {
    chunkCount: 4, cleanedTextLength: 100, contentRevision: 1, embeddingModelId: 'model', embeddingModelRevision: 'revision', embeddingVersion: 1,
    extractionMethod: 'body', indexedChunkCount: 1, indexingPhase: status === 'pending' ? 'queued' : status === 'indexing' ? 'embedding' : null,
    indexingStatus: status, savedAt: 1, text: 'Saved page text', title: status, truncated: false, url: `https://${status}.example`, ...overrides,
  };
}

describe('dashboard state helpers', () => {
  it('maps errors and metadata to safe user messages', () => {
    expect(searchErrorMessage('NO_INDEXED_CONTENT')).toContain('No indexed pages');
    expect(indexingErrorMessage('MODEL_LOAD_FAILED')).toContain('local embedding model');
    expect(extractionMethodLabel('main')).toBe('Main fallback');
    expect(articleMetadataLabel({ title: 'Example', byline: 'Author', siteName: 'Example', language: 'en' })).toBe('By Author · en');
  });

  it('formats relevance, progress phases, and measured summaries', () => {
    expect(hybridRelevanceLabel(0.65)).toBe('Strong match');
    expect(hybridRelevanceLabel(0.45)).toBe('Good match');
    expect(hybridRelevanceLabel(0.44)).toBe('Relevant result');
    expect(searchProgressLabel('loading-model')).toContain('bundled local model');
    expect(searchProgressLabel('embedding-query')).toContain('Embedding query');
    expect(searchProgressLabel('ranking')).toContain('Ranking');
    expect(formatSearchSummary(3, 204, 179.6)).toBe('3 results · 204 indexed chunks considered · 180 ms');
    expect(relevanceExplanation()).toContain('semantic meaning');
    expect(deriveSearchView('searching', 0)).toBe('loading');
    expect(deriveSearchView('no-results', 0)).toBe('no-results');
    expect(deriveSearchView('failed', 0)).toBe('failure');
  });

  it('derives durable indexing progress and handles malformed totals', () => {
    expect(deriveIndexingPresentation(page('pending'))).toMatchObject({ label: 'Queued for local indexing', current: 1, maximum: 4, percent: 25, retryable: false });
    const loading = deriveIndexingPresentation(page('indexing', { indexingPhase: 'loading-model' }));
    expect(loading.label).toBe('Loading local model');
    expect(loading).not.toHaveProperty('maximum');
    expect(deriveIndexingPresentation(page('indexed'))).toMatchObject({ label: 'Indexed', current: 4, percent: 100 });
    expect(deriveIndexingPresentation(page('failed'))).toMatchObject({ label: 'Indexing failed', retryable: true });
    expect(deriveIndexingPresentation(page('pending', { chunkCount: 0, indexedChunkCount: Number.NaN }))).toMatchObject({ current: 0, maximum: undefined, percent: undefined });
  });

  it('formats safe dates, URLs, hostnames, and Unicode snippets', () => {
    expect(formatSavedDate(Number.NaN)).toBe('Unknown save date');
    expect(formatSavedDate(9e15)).toBe('Unknown save date');
    expect(safePageUrl('javascript:alert(1)')).toBeUndefined();
    expect(safePageUrl('https://example.com/path')).toBe('https://example.com/path');
    expect(safeHostname('not a url')).toBe('Unknown source');
    const snippet = createSavedSnippet(`${'😀 '.repeat(120)}finish`, 20);
    expect(Array.from(snippet).length).toBeLessThanOrEqual(20);
    expect(snippet.endsWith('…')).toBe(true);
  });

  it('filters pages and derives a local summary', () => {
    const pages = [page('pending'), page('indexing'), page('indexed'), page('failed')];
    expect(filterSavedPages(pages, 'in-progress')).toHaveLength(2);
    expect(filterSavedPages(pages, 'failed')).toHaveLength(1);
    expect(settingsSummary({ chunkCount: 8, chunkStatuses: { failed: 1, indexed: 6, indexing: 1, pending: 0 }, pageCount: 2, pageStatuses: { failed: 0, indexed: 1, indexing: 1, pending: 0 } })).toBe('2 saved pages · 6 indexed chunks');
  });

  it('rejects stale final results and progress updates', () => {
    expect(isCurrentSearchResponse('current', 'current')).toBe(true);
    expect(isCurrentSearchResponse('current', 'stale')).toBe(false);
    expect(isCurrentSearchProgress('current', 'current')).toBe(true);
    expect(isCurrentSearchProgress(null, 'current')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { articleMetadataLabel, extractionMethodLabel, formatSavedDate, hybridRelevanceLabel, indexingErrorMessage, isCurrentSearchResponse, searchErrorMessage } from './dashboard-state';

describe('dashboard state helpers', () => {
  it('maps internal errors to safe user messages', () => {
    expect(searchErrorMessage('NO_INDEXED_CONTENT')).toContain('No indexed pages');
    expect(indexingErrorMessage('MODEL_LOAD_FAILED')).toContain('local embedding model');
  });

  it('formats extraction and article metadata labels', () => {
    expect(extractionMethodLabel('main')).toBe('Main fallback');
    expect(articleMetadataLabel({ title: 'Example', byline: 'Author', siteName: 'Example', language: 'en' })).toBe('By Author · en');
  });

  it('formats hybrid relevance, safe dates, and stale response checks', () => {
    expect(hybridRelevanceLabel(0.65)).toBe('Strong match');
    expect(hybridRelevanceLabel(0.45)).toBe('Good match');
    expect(hybridRelevanceLabel(0.44)).toBe('Relevant match');
    expect(formatSavedDate(Number.NaN)).toBe('Unknown save date');
    expect(formatSavedDate(9e15)).toBe('Unknown save date');
    expect(isCurrentSearchResponse('current', 'current')).toBe(true);
    expect(isCurrentSearchResponse('current', 'stale')).toBe(false);
  });
});

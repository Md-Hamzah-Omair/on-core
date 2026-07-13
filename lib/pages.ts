import {
  cleanAndTruncatePageText,
  MAX_CLEAN_TEXT_LENGTH,
  truncateTextAtBoundary,
  validateCleanedText,
} from './text-cleaning';
import { chunkText, type TextChunkDraft } from './text-chunking';
import type { IndexingPhase, IndexingStatus } from './indexing';

export interface SavedPage {
  contentRevision: number;
  embeddingModelId: string;
  embeddingModelRevision: string;
  embeddingVersion: number;
  id?: number;
  indexedChunkCount: number;
  indexingError?: string;
  indexingPhase: IndexingPhase;
  indexingStatus: IndexingStatus;
  url: string;
  title: string;
  text: string;
  savedAt: number;
  truncated: boolean;
  cleanedTextLength: number;
  chunkCount: number;
}

export interface PageCaptureData {
  title: string;
  url: string;
  text: string;
  truncated: boolean;
}

export interface PreparedPage {
  page: Omit<
    SavedPage,
    | 'contentRevision'
    | 'embeddingModelId'
    | 'embeddingModelRevision'
    | 'embeddingVersion'
    | 'id'
    | 'indexedChunkCount'
    | 'indexingError'
    | 'indexingPhase'
    | 'indexingStatus'
    | 'savedAt'
  >;
  chunks: TextChunkDraft[];
}

export class PageContentError extends Error {
  constructor(readonly reason: 'EMPTY_CONTENT' | 'CONTENT_TOO_SHORT') {
    super(reason === 'EMPTY_CONTENT' ? 'No visible text found on page.' : 'The page does not contain enough visible text to save.');
  }
}

export const MAX_TEXT_LENGTH = MAX_CLEAN_TEXT_LENGTH;
export const MAX_TITLE_LENGTH = 1000;
export const MAX_URL_LENGTH = 8192;

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function normalizePageTitle(title: string): string {
  return truncateTextAtBoundary(normalizeWhitespace(title), MAX_TITLE_LENGTH);
}

export function isValidProtocol(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function canonicalizeUrl(urlStr: string): string {
  const parsed = new URL(urlStr);
  parsed.hash = '';
  return parsed.toString();
}

export function truncateText(text: string): { text: string; truncated: boolean } {
  return cleanAndTruncatePageText(text);
}

export function validatePageData(data: { title: string; url: string; text: string }): {
  valid: boolean;
  error?: string;
} {
  if (typeof data.title !== 'string' || typeof data.url !== 'string' || typeof data.text !== 'string') {
    return { valid: false, error: 'Invalid data types' };
  }

  const trimmedUrl = data.url.trim();
  if (!trimmedUrl) return { valid: false, error: 'Empty URL' };
  if (!isValidProtocol(trimmedUrl)) return { valid: false, error: 'Unsupported URL protocol' };
  if (!normalizeWhitespace(data.title)) return { valid: false, error: 'Empty page title' };
  if (!data.text.trim()) return { valid: false, error: 'No visible text found on page' };
  if (data.title.length > MAX_TITLE_LENGTH) return { valid: false, error: `Title exceeds character limit (${MAX_TITLE_LENGTH})` };
  if (data.url.length > MAX_URL_LENGTH) return { valid: false, error: `URL exceeds character limit (${MAX_URL_LENGTH})` };
  if (data.text.length > MAX_TEXT_LENGTH) return { valid: false, error: `Text exceeds character limit (${MAX_TEXT_LENGTH})` };

  return { valid: true };
}

export function preparePageForStorage(data: PageCaptureData): PreparedPage {
  const cleaned = cleanAndTruncatePageText(data.text);
  const validation = validateCleanedText(cleaned.text);
  if (!validation.valid) {
    throw new PageContentError(validation.reason);
  }

  const chunks = chunkText(cleaned.text);
  return {
    page: {
      url: canonicalizeUrl(data.url),
      title: normalizePageTitle(data.title),
      text: cleaned.text,
      truncated: data.truncated || cleaned.truncated,
      cleanedTextLength: cleaned.text.length,
      chunkCount: chunks.length,
    },
    chunks,
  };
}

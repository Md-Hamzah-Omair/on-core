import { describe, expect, it } from 'vitest';
import {
  isCaptureRequest,
  isCloseOffscreenDocumentRequest,
  isExtractedPageMessage,
  isRetryIndexingRequest,
  isSearchMemoryRequest,
  isRunEmbeddingProbeOffscreenRequest,
  isRunEmbeddingProbeRequest,
  isRunIndexingQueueRequest,
} from './messages';

describe('messages validation', () => {
  it('validates CAPTURE_ACTIVE_PAGE requests', () => {
    expect(isCaptureRequest({ type: 'CAPTURE_ACTIVE_PAGE', version: 1 })).toBe(true);
    expect(isCaptureRequest({ type: 'CAPTURE_ACTIVE_PAGE', version: 2 })).toBe(false);
    expect(isCaptureRequest({ type: 'OTHER_TYPE', version: 1 })).toBe(false);
    expect(isCaptureRequest(null)).toBe(false);
    expect(isCaptureRequest('string')).toBe(false);
  });

  it('validates PAGE_EXTRACTED messages', () => {
    const valid = {
      type: 'PAGE_EXTRACTED',
        version: 2,
      payload: {
        title: 'Title',
        url: 'https://example.com',
        text: 'Hello content',
        truncated: false,
        extractionMethod: 'readability',
        byline: 'Example Author',
      },
    };
    expect(isExtractedPageMessage(valid)).toBe(true);

    expect(isExtractedPageMessage({ ...valid, version: 1 })).toBe(false);
    expect(isExtractedPageMessage({ ...valid, payload: null })).toBe(false);
    expect(isExtractedPageMessage({
      ...valid,
      payload: { title: 'Title', url: 'https://example.com', text: 'content', extractionMethod: 'body' },
    })).toBe(false);
    expect(isExtractedPageMessage({
      ...valid,
      payload: { title: 123, url: 'https://example.com', text: 'content', truncated: false, extractionMethod: 'body' },
    })).toBe(false);
    expect(isExtractedPageMessage({ ...valid, payload: { ...valid.payload, extractionMethod: 'unknown' } })).toBe(false);
    expect(isExtractedPageMessage({ ...valid, payload: { ...valid.payload, html: '<article>secret</article>' } })).toBe(false);
  });

  it('validates indexing queue requests', () => {
    expect(isRetryIndexingRequest({ pageId: 1, type: 'RETRY_PAGE_INDEXING', version: 1 })).toBe(true);
    expect(isRetryIndexingRequest({ pageId: 1.5, type: 'RETRY_PAGE_INDEXING', version: 1 })).toBe(false);
    expect(isRunIndexingQueueRequest({ type: 'RUN_INDEXING_QUEUE', version: 1 })).toBe(true);
    expect(isRunIndexingQueueRequest({ type: 'RUN_INDEXING_QUEUE', version: 2 })).toBe(false);
    expect(isCloseOffscreenDocumentRequest({ type: 'CLOSE_OFFSCREEN_DOCUMENT', version: 1 })).toBe(true);
    expect(isCloseOffscreenDocumentRequest({ type: 'CLOSE_OFFSCREEN_DOCUMENT', version: 2 })).toBe(false);
    expect(isRunEmbeddingProbeRequest({ type: 'RUN_EMBEDDING_PROBE', version: 1 })).toBe(true);
    expect(isRunEmbeddingProbeOffscreenRequest({ type: 'RUN_EMBEDDING_PROBE_OFFSCREEN', version: 1 })).toBe(true);
    expect(isSearchMemoryRequest({ limit: 10, query: 'semantic search', requestId: 'search-id', type: 'SEARCH_MEMORY', version: 1 })).toBe(true);
    expect(isSearchMemoryRequest({ limit: 0, query: 'semantic search', requestId: 'search-id', type: 'SEARCH_MEMORY', version: 1 })).toBe(false);
  });
});

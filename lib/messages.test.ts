import { describe, expect, it } from 'vitest';
import { isCaptureRequest, isExtractedPageMessage } from './messages';

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
      version: 1,
      payload: {
        title: 'Title',
        url: 'https://example.com',
        text: 'Hello content',
        truncated: false,
      },
    };
    expect(isExtractedPageMessage(valid)).toBe(true);

    expect(isExtractedPageMessage({ ...valid, version: 2 })).toBe(false);
    expect(isExtractedPageMessage({ ...valid, payload: null })).toBe(false);
    expect(isExtractedPageMessage({
      ...valid,
      payload: { title: 'Title', url: 'https://example.com', text: 'content' },
    })).toBe(false);
    expect(isExtractedPageMessage({
      ...valid,
      payload: { title: 123, url: 'https://example.com', text: 'content', truncated: false },
    })).toBe(false);
  });
});

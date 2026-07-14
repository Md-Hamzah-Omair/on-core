import { describe, expect, it } from 'vitest';
import {
  canonicalizeUrl,
  isValidProtocol,
  normalizeWhitespace,
  PageContentError,
  preparePageForStorage,
  truncateText,
  validatePageData,
  MAX_TEXT_LENGTH,
} from './pages';

describe('pages domain helpers', () => {
  it('normalizes page titles into one line', () => {
    const raw = '  Hello \n\n world  \t  this is\r \r a test  ';
    expect(normalizeWhitespace(raw)).toBe('Hello world this is a test');
  });

  it('validates http and https protocols but rejects others', () => {
    expect(isValidProtocol('http://example.com')).toBe(true);
    expect(isValidProtocol('https://example.com/foo?bar=baz')).toBe(true);
    expect(isValidProtocol('ftp://example.com')).toBe(false);
    expect(isValidProtocol('chrome://settings')).toBe(false);
    expect(isValidProtocol('file:///path/to/file')).toBe(false);
    expect(isValidProtocol('invalid-url')).toBe(false);
  });

  it('removes fragments from URLs while preserving query parameters', () => {
    expect(canonicalizeUrl('https://example.com/page#section1')).toBe('https://example.com/page');
    expect(canonicalizeUrl('https://example.com/foo?bar=baz#ref')).toBe('https://example.com/foo?bar=baz');
  });

  it('truncates text exceeding the limit and flags truncation', () => {
    const underLimit = 'a'.repeat(10);
    const underRes = truncateText(underLimit);
    expect(underRes.text).toBe(underLimit);
    expect(underRes.truncated).toBe(false);

    const overLimit = 'b'.repeat(MAX_TEXT_LENGTH + 100);
    const overRes = truncateText(overLimit);
    expect(overRes.text).toHaveLength(MAX_TEXT_LENGTH);
    expect(overRes.text).toBe('b'.repeat(MAX_TEXT_LENGTH));
    expect(overRes.truncated).toBe(true);
  });

  it('validates page data structure and boundaries', () => {
    const valid = { extractionMethod: 'body' as const, title: 'My Page', url: 'https://example.com', text: 'Some content', truncated: false };
    expect(validatePageData(valid).valid).toBe(true);

    expect(validatePageData({ ...valid, title: '' }).valid).toBe(false);
    expect(validatePageData({ ...valid, text: '   ' }).valid).toBe(false);
    expect(validatePageData({ ...valid, url: 'chrome://extensions' }).valid).toBe(false);
    expect(validatePageData({ ...valid, title: 'a'.repeat(1001) }).valid).toBe(false);
    expect(validatePageData({ ...valid, url: 'https://' + 'a'.repeat(8192) }).valid).toBe(false);
    expect(validatePageData({ ...valid, text: 'a'.repeat(MAX_TEXT_LENGTH + 1) }).valid).toBe(false);
  });

  it('prepares a cleaned, fragment-free page record with chunks', () => {
    const prepared = preparePageForStorage({
      title: '  A\nPage  ',
      url: 'https://example.com/article?ref=home#comments',
      text: ' First paragraph contains enough visible content.\n\nsecond paragraph also contains enough content. ',
      truncated: true,
      extractionMethod: 'readability',
      byline: '  Example Author ',
      siteName: ' Example Site ',
      excerpt: ' Example excerpt ',
      language: 'EN-US',
    });

    expect(prepared).toMatchObject({
      page: {
        title: 'A Page',
        url: 'https://example.com/article?ref=home',
        text: 'First paragraph contains enough visible content.\n\nsecond paragraph also contains enough content.',
        truncated: true,
        cleanedTextLength: prepared.page.text.length,
        chunkCount: 1,
        extractionMethod: 'readability',
        byline: 'Example Author',
        siteName: 'Example Site',
        excerpt: 'Example excerpt',
        language: 'en-us',
      },
      chunks: [{ position: 0 }],
    });
  });

  it('rejects empty and near-empty cleaned page content', () => {
    expect(() => preparePageForStorage({
      title: 'Title',
      url: 'https://example.com',
      text: '   ',
      truncated: false,
      extractionMethod: 'body',
    })).toThrow(PageContentError);
    expect(() => preparePageForStorage({
      title: 'Title',
      url: 'https://example.com',
      text: 'Too short',
      truncated: false,
      extractionMethod: 'body',
    })).toThrow(PageContentError);
  });
});

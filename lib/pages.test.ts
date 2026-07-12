import { describe, expect, it } from 'vitest';
import {
  canonicalizeUrl,
  createPageRecord,
  isValidProtocol,
  normalizeWhitespace,
  truncateText,
  validatePageData,
  MAX_TEXT_LENGTH,
} from './pages';

describe('pages domain helpers', () => {
  it('normalizes multiple spaces, tabs, and newlines into a single space', () => {
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
    const valid = { title: 'My Page', url: 'https://example.com', text: 'Some content' };
    expect(validatePageData(valid).valid).toBe(true);

    expect(validatePageData({ ...valid, title: '' }).valid).toBe(false);
    expect(validatePageData({ ...valid, text: '   ' }).valid).toBe(false);
    expect(validatePageData({ ...valid, url: 'chrome://extensions' }).valid).toBe(false);
    expect(validatePageData({ ...valid, title: 'a'.repeat(1001) }).valid).toBe(false);
    expect(validatePageData({ ...valid, url: 'https://' + 'a'.repeat(8192) }).valid).toBe(false);
    expect(validatePageData({ ...valid, text: 'a'.repeat(MAX_TEXT_LENGTH + 1) }).valid).toBe(false);
  });

  it('builds a normalized, fragment-free page record and retains truncation', () => {
    expect(createPageRecord({
      title: '  A\nPage  ',
      url: 'https://example.com/article?ref=home#comments',
      text: ' First\n\nsecond ',
      truncated: true,
    })).toEqual({
      title: 'A Page',
      url: 'https://example.com/article?ref=home',
      text: 'First second',
      truncated: true,
    });
  });
});

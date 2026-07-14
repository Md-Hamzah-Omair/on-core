// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PageExtractionError, extractPageContent, normalizeExtractionMetadata } from './page-extraction';

async function fixture(name: string): Promise<Document> {
  document.open();
  document.write(await readFile(resolve(process.cwd(), 'lib', 'fixtures', name), 'utf8'));
  document.close();
  return document;
}

describe('page extraction', () => {
  it('uses Readability content and normalized metadata without retaining page chrome', async () => {
    const page = await fixture('readability-article.html');
    const extracted = extractPageContent(page);
    expect(extracted.extractionMethod).toBe('readability');
    expect(extracted.text).toContain('Readable article paragraph one');
    expect(extracted.text).not.toContain('Footer links');
    expect(extracted.siteName).toBe('Example Journal');
    expect(extracted.language).toBe('en-us');
  });

  it('falls back to article, main, and body in order when Readability has no usable result', async () => {
    const noReadability = () => null;
    expect(extractPageContent(await fixture('article-fallback.html'), noReadability).extractionMethod).toBe('article');
    expect(extractPageContent(await fixture('main-fallback.html'), noReadability).extractionMethod).toBe('main');
    expect(extractPageContent(await fixture('body-fallback.html'), noReadability).extractionMethod).toBe('body');
  });

  it('passes a cloned document to Readability and never changes the live document', async () => {
    const page = await fixture('form-content.html');
    const before = page.documentElement.outerHTML;
    let parserDocument: Document | undefined;
    const extracted = extractPageContent(page, (cloned) => {
      parserDocument = cloned;
      cloned.querySelector('article')?.remove();
      return null;
    });
    expect(parserDocument).not.toBe(page);
    expect(page.documentElement.outerHTML).toBe(before);
    expect(extracted.text).not.toContain('secret');
  });

  it('rejects short or navigation-heavy pages and omits malformed metadata', async () => {
    const page = await fixture('navigation-heavy.html');
    expect(() => extractPageContent(page, () => null)).toThrow(PageExtractionError);
    const empty = document.implementation.createHTMLDocument('Empty');
    expect(() => extractPageContent(empty, () => null)).toThrow(PageExtractionError);
    expect(normalizeExtractionMetadata({ byline: '  Author\nName ', language: 'not a valid language tag!' })).toEqual({ byline: 'Author Name' });
  });

  it('truncates oversized readable content without splitting surrogate pairs', () => {
    const page = document.implementation.createHTMLDocument('Large');
    const content = `${'a'.repeat(499998)}😀more`;
    const extracted = extractPageContent(page, () => ({ textContent: content }));
    expect(extracted.truncated).toBe(true);
    expect(extracted.text).toHaveLength(500000);
    expect(extracted.text.endsWith('\uD83D')).toBe(false);
  });
});

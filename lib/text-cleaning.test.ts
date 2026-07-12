import { describe, expect, it } from 'vitest';
import {
  cleanAndTruncatePageText,
  cleanPageText,
  MAX_CLEAN_TEXT_LENGTH,
  validateCleanedText,
} from './text-cleaning';

describe('text cleaning', () => {
  it('normalizes line endings, horizontal whitespace, invisible characters, and paragraphs', () => {
    const input = '  First\t line\r\ncontinues.\r\n\r\n\r\nSecond\u00A0 paragraph\u200B.\f\fThird line.  ';

    expect(cleanPageText(input)).toBe('First line continues.\n\nSecond paragraph.\n\nThird line.');
  });

  it('removes empty lines while preserving readable paragraph boundaries', () => {
    expect(cleanPageText('\n\nOne\nTwo\n\n\n\nThree\n\n')).toBe('One Two\n\nThree');
  });

  it('returns an empty string for empty and whitespace-only input', () => {
    expect(cleanPageText('')).toBe('');
    expect(cleanPageText(' \t\n\r\n\u00A0 ')).toBe('');
  });

  it('has stable output for the same input', () => {
    const input = 'Alpha\r\n\r\nBeta\t\tGamma';
    expect(cleanPageText(input)).toBe(cleanPageText(input));
  });

  it('truncates only above the maximum length and does not split surrogate pairs', () => {
    const atLimit = 'a'.repeat(MAX_CLEAN_TEXT_LENGTH);
    expect(cleanAndTruncatePageText(atLimit)).toEqual({ text: atLimit, truncated: false });

    const aroundEmoji = `${'a'.repeat(19)}😀rest`;
    const truncated = cleanAndTruncatePageText(aroundEmoji, 20);
    expect(truncated).toEqual({ text: 'a'.repeat(19), truncated: true });
  });

  it('rejects empty and near-empty cleaned content', () => {
    expect(validateCleanedText('')).toEqual({ valid: false, reason: 'EMPTY_CONTENT' });
    expect(validateCleanedText('Short content')).toEqual({ valid: false, reason: 'CONTENT_TOO_SHORT' });
    expect(validateCleanedText('This has enough visible content.')).toEqual({ valid: true });
  });
});

export const MAX_CLEAN_TEXT_LENGTH = 500000;
export const MIN_CONTENT_LENGTH = 20;

export interface CleanTextResult {
  text: string;
  truncated: boolean;
}

export type TextValidationResult =
  | { valid: true }
  | { valid: false; reason: 'EMPTY_CONTENT' | 'CONTENT_TOO_SHORT' };

function normalizeLine(line: string): string {
  return line
    .replace(/[\t \u1680\u2000-\u200A\u202F\u205F\u3000]+/g, ' ')
    .trim();
}

export function truncateTextAtBoundary(text: string, maximumLength: number): string {
  let end = Math.min(text.length, maximumLength);

  if (
    end > 0
    && end < text.length
    && /[\uD800-\uDBFF]/.test(text.charAt(end - 1))
    && /[\uDC00-\uDFFF]/.test(text.charAt(end))
  ) {
    end -= 1;
  }

  return text.slice(0, end).trimEnd();
}

export function cleanPageText(input: string): string {
  const normalized = input
    .replace(/\r\n?/g, '\n')
    .replace(/[\f\v]/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');

  const paragraphs: string[] = [];
  let paragraphLines: string[] = [];

  for (const rawLine of normalized.split('\n')) {
    const line = normalizeLine(rawLine);
    if (line) {
      paragraphLines.push(line);
      continue;
    }

    if (paragraphLines.length > 0) {
      paragraphs.push(paragraphLines.join(' '));
      paragraphLines = [];
    }
  }

  if (paragraphLines.length > 0) {
    paragraphs.push(paragraphLines.join(' '));
  }

  return paragraphs.join('\n\n').trim();
}

export function cleanAndTruncatePageText(
  input: string,
  maximumLength = MAX_CLEAN_TEXT_LENGTH,
): CleanTextResult {
  const text = cleanPageText(input);
  if (text.length <= maximumLength) {
    return { text, truncated: false };
  }

  return {
    text: truncateTextAtBoundary(text, maximumLength),
    truncated: true,
  };
}

export function validateCleanedText(text: string): TextValidationResult {
  const contentLength = text.replace(/\s/g, '').length;
  if (contentLength === 0) {
    return { valid: false, reason: 'EMPTY_CONTENT' };
  }

  if (contentLength < MIN_CONTENT_LENGTH) {
    return { valid: false, reason: 'CONTENT_TOO_SHORT' };
  }

  return { valid: true };
}

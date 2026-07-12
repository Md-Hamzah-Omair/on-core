export interface SavedPage {
  id?: number;
  url: string;
  title: string;
  text: string;
  savedAt: number;
  truncated: boolean;
}

export const MAX_TEXT_LENGTH = 500000;
export const MAX_TITLE_LENGTH = 1000;
export const MAX_URL_LENGTH = 8192;

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
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
  if (text.length > MAX_TEXT_LENGTH) {
    return {
      text: text.slice(0, MAX_TEXT_LENGTH),
      truncated: true,
    };
  }
  return {
    text,
    truncated: false,
  };
}

export function validatePageData(data: { title: string; url: string; text: string }): {
  valid: boolean;
  error?: string;
} {
  if (typeof data.title !== 'string' || typeof data.url !== 'string' || typeof data.text !== 'string') {
    return { valid: false, error: 'Invalid data types' };
  }

  const trimmedTitle = data.title.trim();
  const trimmedUrl = data.url.trim();
  const trimmedText = data.text.trim();

  if (!trimmedUrl) {
    return { valid: false, error: 'Empty URL' };
  }

  if (!isValidProtocol(trimmedUrl)) {
    return { valid: false, error: 'Unsupported URL protocol' };
  }

  if (!trimmedTitle) {
    return { valid: false, error: 'Empty page title' };
  }

  if (!trimmedText) {
    return { valid: false, error: 'No visible text found on page' };
  }

  if (trimmedTitle.length > MAX_TITLE_LENGTH) {
    return { valid: false, error: `Title exceeds character limit (${MAX_TITLE_LENGTH})` };
  }

  if (trimmedUrl.length > MAX_URL_LENGTH) {
    return { valid: false, error: `URL exceeds character limit (${MAX_URL_LENGTH})` };
  }

  if (data.text.length > MAX_TEXT_LENGTH) {
    return { valid: false, error: `Text exceeds character limit (${MAX_TEXT_LENGTH})` };
  }

  return { valid: true };
}

export function createPageRecord(data: {
  title: string;
  url: string;
  text: string;
  truncated: boolean;
}): Omit<SavedPage, 'id' | 'savedAt'> {
  const { text, truncated } = truncateText(normalizeWhitespace(data.text));

  return {
    url: canonicalizeUrl(data.url),
    title: normalizeWhitespace(data.title),
    text,
    truncated: data.truncated || truncated,
  };
}

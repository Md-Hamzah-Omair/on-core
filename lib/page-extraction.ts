import { Readability } from '@mozilla/readability';
import { cleanAndTruncatePageText, cleanPageText, truncateTextAtBoundary } from './text-cleaning';

export const EXTRACTION_METHODS = ['readability', 'article', 'main', 'body'] as const;
export type ExtractionMethod = (typeof EXTRACTION_METHODS)[number];

export interface ExtractionMetadata {
  extractionMethod: ExtractionMethod;
  byline?: string;
  excerpt?: string;
  language?: string;
  siteName?: string;
}

export interface ExtractedPageContent extends ExtractionMetadata {
  text: string;
  title: string;
  truncated: boolean;
}

export interface ReadabilityResult {
  byline?: string | null;
  content?: string | null;
  excerpt?: string | null;
  lang?: string | null;
  siteName?: string | null;
  textContent?: string | null;
  title?: string | null;
}

export class PageExtractionError extends Error {
  constructor() {
    super('No useful readable content found on page.');
  }
}

const MIN_USEFUL_CONTENT_LENGTH = 200;
const MAX_METADATA_LENGTH = 300;
const MAX_EXCERPT_LENGTH = 2000;
const MAX_LANGUAGE_LENGTH = 35;
const PRIVATE_OR_HIDDEN_SELECTOR = [
  'script', 'style', 'noscript', 'template', 'form', 'input', 'textarea', 'select',
  'option', 'button', '[contenteditable]', '[hidden]', '[aria-hidden="true"]',
].join(', ');
const FALLBACK_NOISE_SELECTOR = [
  PRIVATE_OR_HIDDEN_SELECTOR, 'nav', 'menu', '[role="navigation"]', '[role="menu"]',
  'aside', 'footer',
].join(', ');
const CONTROL_SELECTOR = [
  'nav', 'menu', '[role="navigation"]', '[role="menu"]', 'form', 'input', 'textarea',
  'select', 'option', 'button', '[contenteditable]',
].join(', ');
const LANGUAGE_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;

function textFromElement(element: Element): string {
  return typeof (element as HTMLElement).innerText === 'string'
    ? (element as HTMLElement).innerText
    : (element.textContent ?? '');
}

function removeElements(root: ParentNode, selector: string) {
  root.querySelectorAll(selector).forEach((element) => element.remove());
}

function cloneDocument(document: Document): Document {
  return document.cloneNode(true) as Document;
}

function normalizeBoundedText(value: unknown, maximumLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = cleanPageText(value).replace(/\s+/g, ' ').trim();
  return normalized ? truncateTextAtBoundary(normalized, maximumLength) : undefined;
}

export function normalizeExtractionMetadata(metadata: Partial<Record<keyof ExtractionMetadata, unknown>>): Omit<ExtractionMetadata, 'extractionMethod'> {
  const byline = normalizeBoundedText(metadata.byline, MAX_METADATA_LENGTH);
  const siteName = normalizeBoundedText(metadata.siteName, MAX_METADATA_LENGTH);
  const excerpt = normalizeBoundedText(metadata.excerpt, MAX_EXCERPT_LENGTH);
  const languageCandidate = typeof metadata.language === 'string' ? metadata.language.trim() : undefined;
  const language = languageCandidate && languageCandidate.length <= MAX_LANGUAGE_LENGTH && LANGUAGE_PATTERN.test(languageCandidate)
    ? languageCandidate.toLowerCase()
    : undefined;
  return {
    ...(byline ? { byline } : {}),
    ...(siteName ? { siteName } : {}),
    ...(excerpt ? { excerpt } : {}),
    ...(language ? { language } : {}),
  };
}

function metaContent(document: Document, selector: string): string | undefined {
  return normalizeBoundedText(document.querySelector(selector)?.getAttribute('content'), MAX_EXCERPT_LENGTH);
}

function isUsefulFallback(element: Element): { text: string; truncated: boolean } | undefined {
  const candidate = element.cloneNode(true) as Element;
  const total = cleanPageText(textFromElement(candidate)).replace(/\s/g, '').length;
  const controls = Array.from(candidate.querySelectorAll(CONTROL_SELECTOR))
    .reduce((length, control) => length + cleanPageText(textFromElement(control)).replace(/\s/g, '').length, 0);
  removeElements(candidate, FALLBACK_NOISE_SELECTOR);
  const cleaned = cleanAndTruncatePageText(textFromElement(candidate));
  const contentLength = cleaned.text.replace(/\s/g, '').length;
  if (contentLength < MIN_USEFUL_CONTENT_LENGTH || (total > 0 && controls / total >= 0.5)) return undefined;
  return cleaned;
}

function bestFallback(document: Document, selector: string): { text: string; truncated: boolean } | undefined {
  let best: { text: string; truncated: boolean } | undefined;
  document.querySelectorAll(selector).forEach((element) => {
    const candidate = isUsefulFallback(element);
    if (candidate && (!best || candidate.text.length > best.text.length)) best = candidate;
  });
  return best;
}

export function extractPageContent(
  sourceDocument: Document,
  parseReadability: (document: Document) => ReadabilityResult | null = (document) => new Readability(document).parse(),
): ExtractedPageContent {
  const sanitized = cloneDocument(sourceDocument);
  removeElements(sanitized, PRIVATE_OR_HIDDEN_SELECTOR);
  const readabilityDocument = cloneDocument(sanitized);
  const readability = parseReadability(readabilityDocument);
  const readabilityText = readability ? cleanAndTruncatePageText(readability.textContent ?? '') : undefined;
  const readableLength = readabilityText?.text.replace(/\s/g, '').length ?? 0;
  const documentTitle = normalizeBoundedText(sourceDocument.title, 1000) ?? 'Untitled Page';
  const metadata = normalizeExtractionMetadata({
    byline: readability?.byline,
    excerpt: readability?.excerpt ?? metaContent(sourceDocument, 'meta[name="description"]'),
    language: readability?.lang ?? sourceDocument.documentElement.lang,
    siteName: readability?.siteName ?? metaContent(sourceDocument, 'meta[property="og:site_name"]'),
  });
  const title = normalizeBoundedText(readability?.title, 1000) ?? documentTitle;

  if (readabilityText && readableLength >= MIN_USEFUL_CONTENT_LENGTH) {
    return { ...metadata, extractionMethod: 'readability', text: readabilityText.text, title, truncated: readabilityText.truncated };
  }

  for (const [method, selector] of [['article', 'article'], ['main', 'main'], ['body', 'body']] as const) {
    const fallback = bestFallback(sanitized, selector);
    if (fallback) {
      return { ...metadata, extractionMethod: method, text: fallback.text, title: documentTitle, truncated: fallback.truncated };
    }
  }

  throw new PageExtractionError();
}

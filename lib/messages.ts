export type CaptureRequest = {
  type: 'CAPTURE_ACTIVE_PAGE';
  version: 1;
};

export type RetryIndexingRequest = {
  pageId: number;
  type: 'RETRY_PAGE_INDEXING';
  version: 1;
};

export type RunIndexingQueueRequest = {
  type: 'RUN_INDEXING_QUEUE';
  version: 1;
};

export type CloseOffscreenDocumentRequest = {
  type: 'CLOSE_OFFSCREEN_DOCUMENT';
  version: 1;
};

export type RunEmbeddingProbeRequest = {
  type: 'RUN_EMBEDDING_PROBE';
  version: 1;
};

export type RunEmbeddingProbeOffscreenRequest = {
  type: 'RUN_EMBEDDING_PROBE_OFFSCREEN';
  version: 1;
};

export type SearchMemoryRequest = { limit: number; requestId: string; query: string; type: 'SEARCH_MEMORY'; version: 1 };
export type SearchMemoryOffscreenRequest = { limit: number; requestId: string; query: string; type: 'SEARCH_MEMORY_OFFSCREEN'; version: 1 };
export type CancelSearchRequest = { requestId: string; type: 'CANCEL_SEARCH'; version: 1 };
export type CancelSearchOffscreenRequest = { requestId: string; type: 'CANCEL_SEARCH_OFFSCREEN'; version: 1 };
export type DeleteAllLocalDataRequest = { type: 'DELETE_ALL_LOCAL_DATA'; version: 1 };

import type { ExtractionMethod } from './page-extraction';

export type ExtractedPageMessage = {
  type: 'PAGE_EXTRACTED';
  version: 2;
  payload: {
    title: string;
    url: string;
    text: string;
    truncated: boolean;
    extractionMethod: ExtractionMethod;
    byline?: string;
    siteName?: string;
    excerpt?: string;
    language?: string;
  };
};

export type CaptureResponse =
  | {
      ok: true;
      page: {
        id: number;
        title: string;
        url: string;
        savedAt: number;
        warning?: string;
      };
    }
  | {
      ok: false;
      code:
        | 'NO_ACTIVE_TAB'
        | 'UNSUPPORTED_URL'
        | 'INJECTION_FAILED'
        | 'INVALID_MESSAGE'
        | 'EMPTY_CONTENT'
        | 'SAVE_FAILED';
      message: string;
    };

export function isCaptureRequest(msg: unknown): msg is CaptureRequest {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  return m.type === 'CAPTURE_ACTIVE_PAGE' && m.version === 1;
}

export function isRetryIndexingRequest(msg: unknown): msg is RetryIndexingRequest {
  if (!msg || typeof msg !== 'object') return false;
  const message = msg as Record<string, unknown>;
  return message.type === 'RETRY_PAGE_INDEXING'
    && message.version === 1
    && typeof message.pageId === 'number'
    && Number.isInteger(message.pageId)
    && message.pageId > 0;
}

export function isRunIndexingQueueRequest(msg: unknown): msg is RunIndexingQueueRequest {
  if (!msg || typeof msg !== 'object') return false;
  const message = msg as Record<string, unknown>;
  return message.type === 'RUN_INDEXING_QUEUE' && message.version === 1;
}

export function isCloseOffscreenDocumentRequest(msg: unknown): msg is CloseOffscreenDocumentRequest {
  if (!msg || typeof msg !== 'object') return false;
  const message = msg as Record<string, unknown>;
  return message.type === 'CLOSE_OFFSCREEN_DOCUMENT' && message.version === 1;
}

export function isRunEmbeddingProbeRequest(msg: unknown): msg is RunEmbeddingProbeRequest {
  if (!msg || typeof msg !== 'object') return false;
  const message = msg as Record<string, unknown>;
  return message.type === 'RUN_EMBEDDING_PROBE' && message.version === 1;
}

export function isRunEmbeddingProbeOffscreenRequest(msg: unknown): msg is RunEmbeddingProbeOffscreenRequest {
  if (!msg || typeof msg !== 'object') return false;
  const message = msg as Record<string, unknown>;
  return message.type === 'RUN_EMBEDDING_PROBE_OFFSCREEN' && message.version === 1;
}

function isSearchRequest(message: Record<string, unknown>, type: string): boolean {
  return message.type === type && message.version === 1 && typeof message.requestId === 'string' && message.requestId.length > 0 && message.requestId.length <= 128 && typeof message.query === 'string' && typeof message.limit === 'number' && Number.isInteger(message.limit) && message.limit >= 1 && message.limit <= 20;
}

export function isSearchMemoryRequest(msg: unknown): msg is SearchMemoryRequest {
  return !!msg && typeof msg === 'object' && isSearchRequest(msg as Record<string, unknown>, 'SEARCH_MEMORY');
}
export function isSearchMemoryOffscreenRequest(msg: unknown): msg is SearchMemoryOffscreenRequest {
  return !!msg && typeof msg === 'object' && isSearchRequest(msg as Record<string, unknown>, 'SEARCH_MEMORY_OFFSCREEN');
}
export function isCancelSearchRequest(msg: unknown): msg is CancelSearchRequest {
  return !!msg && typeof msg === 'object' && (msg as Record<string, unknown>).type === 'CANCEL_SEARCH' && (msg as Record<string, unknown>).version === 1 && typeof (msg as Record<string, unknown>).requestId === 'string';
}
export function isCancelSearchOffscreenRequest(msg: unknown): msg is CancelSearchOffscreenRequest {
  return !!msg && typeof msg === 'object' && (msg as Record<string, unknown>).type === 'CANCEL_SEARCH_OFFSCREEN' && (msg as Record<string, unknown>).version === 1 && typeof (msg as Record<string, unknown>).requestId === 'string';
}

export function isDeleteAllLocalDataRequest(msg: unknown): msg is DeleteAllLocalDataRequest {
  return !!msg && typeof msg === 'object' && (msg as Record<string, unknown>).type === 'DELETE_ALL_LOCAL_DATA' && (msg as Record<string, unknown>).version === 1;
}

export function isExtractedPageMessage(msg: unknown): msg is ExtractedPageMessage {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  if (m.type !== 'PAGE_EXTRACTED' || m.version !== 2) return false;
  const payload = m.payload;
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  const keys = Object.keys(p);
  if (!keys.every((key) => ['title', 'url', 'text', 'truncated', 'extractionMethod', 'byline', 'siteName', 'excerpt', 'language'].includes(key))) return false;
  return (
    typeof p.title === 'string' &&
    typeof p.url === 'string' &&
    typeof p.text === 'string' &&
    typeof p.truncated === 'boolean' &&
    ['readability', 'article', 'main', 'body'].includes(p.extractionMethod as string) &&
    ['byline', 'siteName', 'excerpt', 'language'].every((key) => p[key] === undefined || typeof p[key] === 'string')
  );
}

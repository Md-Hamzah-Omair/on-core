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

export type ExtractedPageMessage = {
  type: 'PAGE_EXTRACTED';
  version: 1;
  payload: {
    title: string;
    url: string;
    text: string;
    truncated: boolean;
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

export function isExtractedPageMessage(msg: unknown): msg is ExtractedPageMessage {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  if (m.type !== 'PAGE_EXTRACTED' || m.version !== 1) return false;
  const payload = m.payload;
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.title === 'string' &&
    typeof p.url === 'string' &&
    typeof p.text === 'string' &&
    typeof p.truncated === 'boolean'
  );
}

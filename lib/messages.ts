export type CaptureRequest = {
  type: 'CAPTURE_ACTIVE_PAGE';
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

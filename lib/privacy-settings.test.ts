import { describe, expect, it } from 'vitest';
import { LOCAL_RUNTIME_DETAILS, formatStorageEstimate } from './privacy-settings';

describe('privacy settings helpers', () => {
  it('formats only reliable storage estimates', () => {
    expect(formatStorageEstimate(1536)).toBe('1.5 KB');
    expect(formatStorageEstimate(undefined)).toBe('Storage estimate unavailable');
  });

  it('exposes pinned local runtime metadata', () => {
    expect(LOCAL_RUNTIME_DETAILS.dimension).toBe(384);
    expect(LOCAL_RUNTIME_DETAILS.modelId).toBe('Xenova/all-MiniLM-L6-v2');
  });
});

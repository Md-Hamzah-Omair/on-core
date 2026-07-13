import { describe, expect, it } from 'vitest';
import { indexingErrorMessage, searchErrorMessage } from './dashboard-state';

describe('dashboard state helpers', () => {
  it('maps internal errors to safe user messages', () => {
    expect(searchErrorMessage('NO_INDEXED_CONTENT')).toContain('No indexed pages');
    expect(indexingErrorMessage('MODEL_LOAD_FAILED')).toContain('local embedding model');
  });
});

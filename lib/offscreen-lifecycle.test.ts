import { describe, expect, it, vi } from 'vitest';
import { closeOffscreenDocument, requestOffscreenClose } from './offscreen-lifecycle';

describe('offscreen lifecycle helpers', () => {
  it('does not call an unavailable offscreen API', async () => {
    const reportError = vi.fn();
    await expect(closeOffscreenDocument(undefined, reportError)).resolves.toBeUndefined();
    expect(reportError).not.toHaveBeenCalled();
  });

  it('contains close failures so they cannot mask indexing failures', async () => {
    const reportError = vi.fn();
    const closeDocument = vi.fn().mockRejectedValue(new Error('close failed'));
    await expect(closeOffscreenDocument({ closeDocument }, reportError)).resolves.toBeUndefined();
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'close failed' }));

    await expect(requestOffscreenClose(async () => { throw new Error('message failed'); }, reportError)).resolves.toBeUndefined();
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'message failed' }));
  });
});

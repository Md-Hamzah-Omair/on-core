import { describe, expect, it } from 'vitest';
import {
  PRIVACY_LOCK_ITERATIONS,
  createPrivacyLockConfig,
  isPrivacyLockExpired,
  parsePrivacyLockConfig,
  verifyPrivacyLockPassword,
} from './privacy-lock';

const password = 'local privacy test password';

describe('privacy-lock verifier', () => {
  it('creates a salted high-cost verifier without plaintext', async () => {
    const first = await createPrivacyLockConfig(password);
    const second = await createPrivacyLockConfig(password);

    expect(PRIVACY_LOCK_ITERATIONS).toBe(600_000);
    expect(first.salt).not.toBe(second.salt);
    expect(first.verifier).not.toBe(second.verifier);
    expect(JSON.stringify(first)).not.toContain(password);
    expect(parsePrivacyLockConfig(first)).toEqual(first);
  });

  it('accepts the correct password and rejects an incorrect password', async () => {
    const config = await createPrivacyLockConfig(password);

    await expect(verifyPrivacyLockPassword(password, config)).resolves.toBe(true);
    await expect(verifyPrivacyLockPassword('incorrect local password', config)).resolves.toBe(false);
  });

  it('detects inactivity expiration at the configured boundary', () => {
    const session = { unlocked: true as const, lastActivityAt: 1_000 };

    expect(isPrivacyLockExpired(session, 5, 300_999)).toBe(false);
    expect(isPrivacyLockExpired(session, 5, 301_000)).toBe(true);
    expect(isPrivacyLockExpired(session, 5, 999)).toBe(true);
  });
});

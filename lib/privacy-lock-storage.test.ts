import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => {
  const local = new Map<string, unknown>();
  const session = new Map<string, unknown>();
  function area(values: Map<string, unknown>) {
    return {
      async get(key: string) { return { [key]: values.get(key) }; },
      async set(items: Record<string, unknown>) { Object.entries(items).forEach(([key, value]) => values.set(key, value)); },
      async remove(key: string) { values.delete(key); },
      async clear() { values.clear(); },
    };
  }
  return { local, session, localArea: area(local), sessionArea: area(session) };
});

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: storage.localArea,
      session: storage.sessionArea,
    },
  },
}));

import {
  PRIVACY_LOCK_CONFIG_KEY,
  PRIVACY_LOCK_SESSION_KEY,
  getPrivacyLockSnapshot,
  lockPrivacyNow,
  setupPrivacyLock,
  unlockPrivacyLock,
  touchPrivacyLock,
} from './privacy-lock-storage';

const password = 'storage lifecycle password';

describe('privacy-lock storage lifecycle', () => {
  beforeEach(() => {
    storage.local.clear();
    storage.session.clear();
  });

  it('sets up and unlocks without storing plaintext', async () => {
    await setupPrivacyLock(password, 15, 1_000);

    expect((await getPrivacyLockSnapshot(2_000)).status).toBe('unlocked');
    expect(JSON.stringify(storage.local.get(PRIVACY_LOCK_CONFIG_KEY))).not.toContain(password);
    await lockPrivacyNow();
    expect((await getPrivacyLockSnapshot(2_000)).status).toBe('locked');
    await touchPrivacyLock(2_500);
    expect((await getPrivacyLockSnapshot(2_501)).status).toBe('locked');
    await expect(unlockPrivacyLock(password, 3_000)).resolves.toBe(true);
    expect((await getPrivacyLockSnapshot(3_001)).status).toBe('unlocked');
  });

  it('returns a generic failure path for an incorrect password', async () => {
    await setupPrivacyLock(password, 15, 1_000);
    await lockPrivacyNow();

    await expect(unlockPrivacyLock('incorrect storage password', 2_000)).resolves.toBe(false);
    expect(storage.session.has(PRIVACY_LOCK_SESSION_KEY)).toBe(false);
  });

  it('returns to locked when browser-session storage is cleared', async () => {
    await setupPrivacyLock(password, 15, 1_000);
    storage.session.clear();

    expect((await getPrivacyLockSnapshot(2_000)).status).toBe('locked');
    expect(storage.local.has(PRIVACY_LOCK_CONFIG_KEY)).toBe(true);
  });

  it('locks and clears the expired session after inactivity', async () => {
    await setupPrivacyLock(password, 5, 1_000);

    expect((await getPrivacyLockSnapshot(301_000)).status).toBe('locked');
    expect(storage.session.has(PRIVACY_LOCK_SESSION_KEY)).toBe(false);
  });

  it('does not treat a malformed existing verifier as first-time setup', async () => {
    storage.local.set(PRIVACY_LOCK_CONFIG_KEY, { verifier: 'corrupt' });

    expect((await getPrivacyLockSnapshot()).status).toBe('locked');
    await expect(setupPrivacyLock(password)).rejects.toThrow('already configured');
  });
});

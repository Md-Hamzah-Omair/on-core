import { browser } from 'wxt/browser';
import {
  createPrivacyLockConfig,
  isAutoLockMinutes,
  isPrivacyLockExpired,
  isPrivacyLockSession,
  parsePrivacyLockConfig,
  verifyPrivacyLockPassword,
  type AutoLockMinutes,
  type PrivacyLockConfig,
} from './privacy-lock';

export const PRIVACY_LOCK_CONFIG_KEY = 'onCorePrivacyLock';
export const PRIVACY_LOCK_SESSION_KEY = 'onCorePrivacyLockSession';

export type PrivacyLockStatus = 'unconfigured' | 'locked' | 'unlocked';

export interface PrivacyLockSnapshot {
  autoLockMinutes: AutoLockMinutes;
  config: PrivacyLockConfig | null;
  status: PrivacyLockStatus;
}

async function withPrivacySessionLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('on-core-privacy-lock-session', operation);
  }
  return operation();
}

async function readStoredConfig(): Promise<{ config: PrivacyLockConfig | null; exists: boolean }> {
  const stored = await browser.storage.local.get(PRIVACY_LOCK_CONFIG_KEY);
  const value = stored[PRIVACY_LOCK_CONFIG_KEY];
  return { config: parsePrivacyLockConfig(value), exists: value !== undefined };
}

async function readConfig(): Promise<PrivacyLockConfig | null> {
  return (await readStoredConfig()).config;
}

export async function getPrivacyLockSnapshot(now = Date.now()): Promise<PrivacyLockSnapshot> {
  const storedConfig = await readStoredConfig();
  const config = storedConfig.config;
  if (!config) return { autoLockMinutes: 15, config: null, status: storedConfig.exists ? 'locked' : 'unconfigured' };
  const stored = await browser.storage.session.get(PRIVACY_LOCK_SESSION_KEY);
  const session = stored[PRIVACY_LOCK_SESSION_KEY];
  if (!isPrivacyLockSession(session) || isPrivacyLockExpired(session, config.autoLockMinutes, now)) {
    await browser.storage.session.remove(PRIVACY_LOCK_SESSION_KEY);
    return { autoLockMinutes: config.autoLockMinutes, config, status: 'locked' };
  }
  return { autoLockMinutes: config.autoLockMinutes, config, status: 'unlocked' };
}

export async function setupPrivacyLock(password: string, autoLockMinutes: AutoLockMinutes = 15, now = Date.now()): Promise<void> {
  if ((await readStoredConfig()).exists) throw new Error('Privacy lock is already configured.');
  const config = await createPrivacyLockConfig(password, autoLockMinutes);
  await browser.storage.local.set({ [PRIVACY_LOCK_CONFIG_KEY]: config });
  await withPrivacySessionLock(() => browser.storage.session.set({ [PRIVACY_LOCK_SESSION_KEY]: { unlocked: true, lastActivityAt: now } }));
}

export async function unlockPrivacyLock(password: string, now = Date.now()): Promise<boolean> {
  const config = await readConfig();
  if (!config || !await verifyPrivacyLockPassword(password, config)) return false;
  await withPrivacySessionLock(() => browser.storage.session.set({ [PRIVACY_LOCK_SESSION_KEY]: { unlocked: true, lastActivityAt: now } }));
  return true;
}

export async function touchPrivacyLock(now = Date.now()): Promise<void> {
  await withPrivacySessionLock(async () => {
    const snapshot = await getPrivacyLockSnapshot(now);
    if (snapshot.status === 'unlocked') {
      await browser.storage.session.set({ [PRIVACY_LOCK_SESSION_KEY]: { unlocked: true, lastActivityAt: now } });
    }
  });
}

export async function lockPrivacyNow(): Promise<void> {
  await withPrivacySessionLock(() => browser.storage.session.remove(PRIVACY_LOCK_SESSION_KEY));
}

export async function setPrivacyLockTimeout(autoLockMinutes: AutoLockMinutes): Promise<void> {
  if (!isAutoLockMinutes(autoLockMinutes)) throw new RangeError('Unsupported auto-lock interval.');
  const config = await readConfig();
  if (!config) throw new Error('Privacy lock is not configured.');
  await browser.storage.local.set({ [PRIVACY_LOCK_CONFIG_KEY]: { ...config, autoLockMinutes } });
  await touchPrivacyLock();
}

export async function resetPrivacyLockStorage(): Promise<void> {
  await browser.storage.local.remove(PRIVACY_LOCK_CONFIG_KEY);
  await withPrivacySessionLock(() => browser.storage.session.remove(PRIVACY_LOCK_SESSION_KEY));
}

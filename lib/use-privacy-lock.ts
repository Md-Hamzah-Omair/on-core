import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import type { AutoLockMinutes } from './privacy-lock';
import {
  PRIVACY_LOCK_CONFIG_KEY,
  PRIVACY_LOCK_SESSION_KEY,
  getPrivacyLockSnapshot,
  lockPrivacyNow,
  resetPrivacyLockStorage,
  setPrivacyLockTimeout,
  setupPrivacyLock,
  touchPrivacyLock,
  unlockPrivacyLock,
  type PrivacyLockSnapshot,
} from './privacy-lock-storage';

export interface PrivacyLockController extends PrivacyLockSnapshot {
  loading: boolean;
  lock: () => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => Promise<void>;
  setTimeoutMinutes: (minutes: AutoLockMinutes) => Promise<void>;
  setup: (password: string, minutes: AutoLockMinutes) => Promise<void>;
  unlock: (password: string) => Promise<boolean>;
}

const INITIAL_SNAPSHOT: PrivacyLockSnapshot = { autoLockMinutes: 15, config: null, status: 'locked' };

export function usePrivacyLock(): PrivacyLockController {
  const [snapshot, setSnapshot] = useState<PrivacyLockSnapshot>(INITIAL_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const lastTouch = useRef(0);
  const refreshSequence = useRef(0);

  async function refresh() {
    const sequence = ++refreshSequence.current;
    const next = await getPrivacyLockSnapshot();
    if (sequence !== refreshSequence.current) return;
    setSnapshot(next);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
    const onChanged = (changes: Record<string, unknown>, areaName: string) => {
      if ((areaName === 'local' && PRIVACY_LOCK_CONFIG_KEY in changes) || (areaName === 'session' && PRIVACY_LOCK_SESSION_KEY in changes)) void refresh();
    };
    browser.storage.onChanged.addListener(onChanged);
    const interval = setInterval(() => void refresh(), 1000);
    return () => {
      browser.storage.onChanged.removeListener(onChanged);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (snapshot.status !== 'unlocked') return;
    const activity = () => {
      const now = Date.now();
      if (now - lastTouch.current < 30_000) return;
      lastTouch.current = now;
      void touchPrivacyLock(now);
    };
    document.addEventListener('keydown', activity, { passive: true });
    document.addEventListener('pointerdown', activity, { passive: true });
    document.addEventListener('focusin', activity, { passive: true });
    document.addEventListener('scroll', activity, { capture: true, passive: true });
    document.addEventListener('wheel', activity, { passive: true });
    return () => {
      document.removeEventListener('keydown', activity);
      document.removeEventListener('pointerdown', activity);
      document.removeEventListener('focusin', activity);
      document.removeEventListener('scroll', activity, true);
      document.removeEventListener('wheel', activity);
    };
  }, [snapshot.status]);

  return {
    ...snapshot,
    loading,
    async lock() {
      refreshSequence.current += 1;
      await lockPrivacyNow();
      setSnapshot((current) => ({ ...current, status: current.config ? 'locked' : 'unconfigured' }));
      setLoading(false);
      await refresh();
    },
    refresh,
    async reset() { refreshSequence.current += 1; await resetPrivacyLockStorage(); await refresh(); },
    async setTimeoutMinutes(minutes) { refreshSequence.current += 1; await setPrivacyLockTimeout(minutes); await refresh(); },
    async setup(password, minutes) { refreshSequence.current += 1; await setupPrivacyLock(password, minutes); await refresh(); },
    async unlock(password) { refreshSequence.current += 1; const valid = await unlockPrivacyLock(password); await refresh(); return valid; },
  };
}

import { useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;
export type SearchResultLimit = 3 | 5 | 10;

export const THEME_STORAGE_KEY = 'local-web-memory.theme';
export const SEARCH_RESULT_LIMIT_STORAGE_KEY = 'local-web-memory.search-result-limit';
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';
export const DEFAULT_SEARCH_RESULT_LIMIT: SearchResultLimit = 3;
export const SEARCH_RESULT_LIMIT_OPTIONS: readonly SearchResultLimit[] = [3, 5, 10];
export const UI_PREFERENCES_CHANGE_EVENT = 'local-web-memory:ui-preferences-change';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function isSearchResultLimit(value: unknown): value is SearchResultLimit {
  return value === 3 || value === 5 || value === 10;
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  return preference === 'system' ? (systemPrefersDark ? 'dark' : 'light') : preference;
}

export function resolveReducedMotion(systemPrefersReducedMotion: boolean): boolean {
  return systemPrefersReducedMotion;
}

function availableLocalStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function readThemePreference(storage: Storage | undefined = availableLocalStorage()): ThemePreference {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : DEFAULT_THEME_PREFERENCE;
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

export function readSearchResultLimit(storage: Storage | undefined = availableLocalStorage()): SearchResultLimit {
  try {
    const value = Number(storage?.getItem(SEARCH_RESULT_LIMIT_STORAGE_KEY));
    return isSearchResultLimit(value) ? value : DEFAULT_SEARCH_RESULT_LIMIT;
  } catch {
    return DEFAULT_SEARCH_RESULT_LIMIT;
  }
}

function announcePreferenceChange(key: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(UI_PREFERENCES_CHANGE_EVENT, { detail: { key } }));
  }
}

export function writeThemePreference(preference: ThemePreference, storage: Storage | undefined = availableLocalStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(THEME_STORAGE_KEY, preference);
    announcePreferenceChange(THEME_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function writeSearchResultLimit(limit: SearchResultLimit, storage: Storage | undefined = availableLocalStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(SEARCH_RESULT_LIMIT_STORAGE_KEY, String(limit));
    announcePreferenceChange(SEARCH_RESULT_LIMIT_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function systemPrefersDark(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  try {
    return resolveReducedMotion(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

export function applyTheme(preference = readThemePreference()): ResolvedTheme {
  const theme = resolveTheme(preference, systemPrefersDark());
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }
  return theme;
}

export function subscribeToThemeChanges(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  let colorScheme: MediaQueryList | undefined;
  try {
    colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
  } catch {
    colorScheme = undefined;
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === THEME_STORAGE_KEY) onChange();
  };
  const onPreferenceChange = (event: Event) => {
    const key = (event as CustomEvent<{ key?: string }>).detail?.key;
    if (!key || key === THEME_STORAGE_KEY) onChange();
  };

  colorScheme?.addEventListener('change', onChange);
  window.addEventListener('storage', onStorage);
  window.addEventListener(UI_PREFERENCES_CHANGE_EVENT, onPreferenceChange);
  return () => {
    colorScheme?.removeEventListener('change', onChange);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(UI_PREFERENCES_CHANGE_EVENT, onPreferenceChange);
  };
}

export function useThemePreference(): {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
} {
  const [preference, setStoredPreference] = useState<ThemePreference>(() => readThemePreference());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => applyTheme(preference));

  useEffect(() => {
    const update = () => {
      const nextPreference = readThemePreference();
      setStoredPreference(nextPreference);
      setResolvedTheme(applyTheme(nextPreference));
    };
    update();
    return subscribeToThemeChanges(update);
  }, []);

  return {
    preference,
    resolvedTheme,
    setPreference: (nextPreference) => {
      writeThemePreference(nextPreference);
      setStoredPreference(nextPreference);
      setResolvedTheme(applyTheme(nextPreference));
    },
  };
}

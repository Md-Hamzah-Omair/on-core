import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEARCH_RESULT_LIMIT,
  DEFAULT_THEME_PREFERENCE,
  SEARCH_RESULT_LIMIT_OPTIONS,
  SEARCH_RESULT_LIMIT_STORAGE_KEY,
  THEME_STORAGE_KEY,
  isSearchResultLimit,
  isThemePreference,
  readSearchResultLimit,
  readThemePreference,
  resolveReducedMotion,
  resolveTheme,
  writeSearchResultLimit,
  writeThemePreference,
} from './ui-preferences';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe('UI preference helpers', () => {
  it('validates supported preference values', () => {
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('contrast')).toBe(false);
    expect(isSearchResultLimit(10)).toBe(true);
    expect(isSearchResultLimit(4)).toBe(false);
    expect(SEARCH_RESULT_LIMIT_OPTIONS).toEqual([3, 5, 10]);
  });

  it('resolves system theme and reduced motion', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveReducedMotion(true)).toBe(true);
  });

  it('uses defaults for missing or invalid stored values', () => {
    const storage = memoryStorage({
      [THEME_STORAGE_KEY]: 'sepia',
      [SEARCH_RESULT_LIMIT_STORAGE_KEY]: '25',
    });
    expect(readThemePreference(storage)).toBe(DEFAULT_THEME_PREFERENCE);
    expect(readSearchResultLimit(storage)).toBe(DEFAULT_SEARCH_RESULT_LIMIT);
  });

  it('reads and writes valid values', () => {
    const storage = memoryStorage();
    expect(writeThemePreference('dark', storage)).toBe(true);
    expect(writeSearchResultLimit(5, storage)).toBe(true);
    expect(readThemePreference(storage)).toBe('dark');
    expect(readSearchResultLimit(storage)).toBe(5);
  });

  it('guards storage failures', () => {
    const broken = memoryStorage();
    broken.getItem = () => { throw new Error('blocked'); };
    broken.setItem = () => { throw new Error('blocked'); };
    expect(readThemePreference(broken)).toBe('system');
    expect(readSearchResultLimit(broken)).toBe(3);
    expect(writeThemePreference('light', broken)).toBe(false);
    expect(writeSearchResultLimit(10, broken)).toBe(false);
  });
});

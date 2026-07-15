export default defineUnlistedScript(() => {
  const storageKey = 'local-web-memory.theme';
  let preference = 'system';

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === 'light' || stored === 'dark' || stored === 'system') preference = stored;
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }

  let systemPrefersDark = false;
  try {
    systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    // Light is the safe fallback when media queries are unavailable.
  }

  const theme = preference === 'system' ? (systemPrefersDark ? 'dark' : 'light') : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
});

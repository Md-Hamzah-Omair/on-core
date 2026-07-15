import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { Button } from '../../components/Button';
import { Progress } from '../../components/Progress';
import type { CaptureResponse } from '../../lib/messages';
import { PROJECT_DESCRIPTION, PROJECT_NAME } from '../../lib/project';

type PopupTheme = 'light' | 'dark' | 'system';

function readPopupTheme(): PopupTheme {
  try {
    const value = localStorage.getItem('local-web-memory.theme');
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
  } catch { return 'system'; }
}

function applyPopupTheme(preference: PopupTheme) {
  const dark = preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = preference === 'system' ? (dark ? 'dark' : 'light') : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export default function App() {
  const [isOpening, setIsOpening] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [theme, setTheme] = useState<PopupTheme>(readPopupTheme);

  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => { const next = readPopupTheme(); setTheme(next); applyPopupTheme(next); };
    const onStorage = (event: StorageEvent) => { if (event.key === 'local-web-memory.theme') update(); };
    media.addEventListener('change', update);
    window.addEventListener('storage', onStorage);
    return () => { media.removeEventListener('change', update); window.removeEventListener('storage', onStorage); };
  }, []);

  function changeTheme(preference: PopupTheme) {
    try { localStorage.setItem('local-web-memory.theme', preference); } catch { /* Keep the in-memory preference. */ }
    setTheme(preference);
    applyPopupTheme(preference);
  }

  async function openDashboard() {
    setIsOpening(true); setError(''); setStatus('');
    try {
      await browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });
      window.close();
    } catch {
      setError('Could not open the dashboard. Please try again.');
      setIsOpening(false);
    }
  }

  async function savePage() {
    setIsSaving(true); setError(''); setStatus('');
    try {
      const response = await browser.runtime.sendMessage({ type: 'CAPTURE_ACTIVE_PAGE', version: 1 }) as CaptureResponse;
      if (response.ok) {
        const action = response.page.updated ? 'Page updated' : 'Page captured';
        const queued = `${response.page.chunkCount} ${response.page.chunkCount === 1 ? 'chunk' : 'chunks'} queued for local indexing.`;
        setStatus(`${action}. ${queued}${response.page.warning ? ` ${response.page.warning}` : ''}`);
      } else {
        setError(response.message || 'Page capture failed.');
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unknown connection error';
      setError(`Could not contact the extension background process: ${message}`);
    } finally { setIsSaving(false); }
  }

  return (
    <main className="popup-shell">
      <header className="popup-header"><div className="popup-identity"><span className="popup-mark" aria-hidden="true">OC</span><strong>{PROJECT_NAME}</strong></div><label className="popup-theme" htmlFor="popup-theme"><span>Theme</span><select id="popup-theme" aria-label="Popup theme" value={theme} onChange={(event) => changeTheme(event.target.value as PopupTheme)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></header>
      <section className="popup-hero" aria-labelledby="popup-title">
        <p className="eyebrow">{isSaving ? 'Saving locally' : 'Private by design'}</p>
        <h1 id="popup-title">{PROJECT_NAME}</h1>
        <p className="description">{PROJECT_DESCRIPTION}</p>
        <p className="privacy-disclosure"><span aria-hidden="true" />Readable text and metadata stay in this browser. Nothing is uploaded.</p>
        {isSaving && <div className="capture-progress" role="status" aria-live="polite"><Progress label="Extracting and saving locally" /><span>Extracting and saving locally...</span></div>}
      </section>
      <div className="actions">
        <Button size="large" loading={isSaving} loadingLabel="Saving locally..." disabled={isOpening} onClick={() => void savePage()}>Save Page</Button>
        <Button size="large" variant="outlined" loading={isOpening} loadingLabel="Opening..." disabled={isSaving} onClick={() => void openDashboard()}>Open dashboard</Button>
      </div>
      <p className="continuity-note">Indexing continues if this popup closes.</p>
      {status && <p className="success" role="status">{status}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}

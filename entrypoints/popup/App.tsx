import { useState } from 'react';
import { browser } from 'wxt/browser';
import { Button } from '../../components/Button';
import { PROJECT_DESCRIPTION, PROJECT_NAME } from '../../lib/project';
import type { CaptureResponse } from '../../lib/messages';

export default function App() {
  const [isOpening, setIsOpening] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function openDashboard() {
    setIsOpening(true);
    setError('');
    setStatus('');

    try {
      await browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });
      window.close();
    } catch {
      setError('Could not open the dashboard. Please try again.');
      setIsOpening(false);
    }
  }

  async function savePage() {
    setIsSaving(true);
    setError('');
    setStatus('');

    try {
      const response = (await browser.runtime.sendMessage({
        type: 'CAPTURE_ACTIVE_PAGE',
        version: 1,
      })) as CaptureResponse;

      if (response.ok) {
        setStatus(`Saved successfully: "${response.page.title}"`);
      } else {
        setError(response.message || 'Page capture failed.');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown connection error';
      setError(`Could not contact background service worker: ${errMsg}`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main>
      <span className="eyebrow" aria-live="polite">
        {isSaving ? 'Saving page...' : 'Private by design'}
      </span>
      <h1>{PROJECT_NAME}</h1>
      <p>{PROJECT_DESCRIPTION}</p>

      <div className="actions">
        <Button
          className="button-primary"
          disabled={isSaving || isOpening}
          onClick={savePage}
        >
          {isSaving ? 'Saving...' : 'Save Page'}
        </Button>
        <Button
          className="button-secondary"
          disabled={isSaving || isOpening}
          onClick={openDashboard}
        >
          {isOpening ? 'Opening...' : 'Open Dashboard'}
        </Button>
      </div>

      {status && <p className="success" role="status">{status}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}

import { useState } from 'react';
import { browser } from 'wxt/browser';
import { Button } from '../../components/Button';
import { PROJECT_DESCRIPTION, PROJECT_NAME } from '../../lib/project';

export default function App() {
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState('');

  async function openDashboard() {
    setIsOpening(true);
    setError('');

    try {
      await browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });
      window.close();
    } catch {
      setError('Could not open the dashboard. Please try again.');
      setIsOpening(false);
    }
  }

  return (
    <main>
      <span className="eyebrow">Private by design</span>
      <h1>{PROJECT_NAME}</h1>
      <p>{PROJECT_DESCRIPTION}</p>
      <Button disabled={isOpening} onClick={openDashboard}>
        {isOpening ? 'Opening...' : 'Open Dashboard'}
      </Button>
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}

import { useEffect, useState } from 'react';
import { getSavedPages } from '../../lib/database';
import { PROJECT_NAME, SEARCH_PLACEHOLDER } from '../../lib/project';
import type { SavedPage } from '../../lib/pages';

export default function App() {
  const [pages, setPages] = useState<SavedPage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadPages() {
      setIsLoading(true);
      setError('');

      try {
        const saved = await getSavedPages();
        if (isMounted) setPages(saved);
      } catch {
        if (isMounted) setError('Saved pages could not be loaded from local storage.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadPages();

    const refreshOnFocus = () => {
      void loadPages();
    };
    window.addEventListener('focus', refreshOnFocus);

    return () => {
      isMounted = false;
      window.removeEventListener('focus', refreshOnFocus);
    };
  }, []);

  function getHostname(urlStr: string): string {
    try {
      return new URL(urlStr).hostname;
    } catch {
      return urlStr;
    }
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  function getSnippet(text: string): string {
    if (text.length > 200) {
      return text.slice(0, 200) + '...';
    }
    return text;
  }

  return (
    <main>
      <header className="dashboard-header">
        <span className="mark">LWM</span>
        <span>{PROJECT_NAME}</span>
      </header>

      <div className="layout-grid">
        <section className="hero-section">
          <p className="eyebrow">Milestone 2: Web Capture</p>
          <h1>Your corner of the web,<br />remembered locally.</h1>

          <div className="search-box">
            <label htmlFor="memory-search">Search your web memory</label>
            <input id="memory-search" type="search" placeholder={SEARCH_PLACEHOLDER} disabled />
          </div>

          <aside className="milestone-badge">
            <strong>Local Storage Active</strong>
            <p>Page capture is fully operational. Offline semantic search is scheduled for a future milestone.</p>
          </aside>
        </section>

        <section className="feed-section">
          <h2>Saved Memories ({pages.length})</h2>

          {isLoading ? (
            <div className="loading" role="status">Loading your saved pages...</div>
          ) : error ? (
            <div className="error-box" role="alert">{error}</div>
          ) : pages.length === 0 ? (
            <div className="empty-state">
              <p>Your web memory is empty.</p>
              <span>Open any webpage and click <strong>Save Page</strong> from the extension popup to save it locally.</span>
            </div>
          ) : (
            <div className="pages-list">
              {pages.map((page) => (
                <article key={page.id || page.url} className="page-card">
                  <header className="card-header">
                    <span className="card-domain">{getHostname(page.url)}</span>
                    <span className="card-date">{formatDate(page.savedAt)}</span>
                  </header>

                  <h3 className="card-title">
                    {page.title}
                  </h3>

                  <p className="card-snippet">{getSnippet(page.text)}</p>

                  {page.truncated && (
                    <span className="badge badge-warning" title="This page was very large and was truncated to 500,000 characters.">
                      Truncated
                    </span>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { deletePage, getPageChunks, getSavedPages } from '../../lib/database';
import { PROJECT_NAME, SEARCH_PLACEHOLDER } from '../../lib/project';
import type { SavedPage } from '../../lib/pages';
import type { StoredTextChunk } from '../../lib/text-chunking';

export default function App() {
  const [pages, setPages] = useState<SavedPage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedPageId, setExpandedPageId] = useState<number | null>(null);
  const [chunkPreviews, setChunkPreviews] = useState<Record<number, StoredTextChunk[]>>({});
  const [loadingChunkPageId, setLoadingChunkPageId] = useState<number | null>(null);
  const [pageErrors, setPageErrors] = useState<Record<number, string>>({});
  const [deletingPageId, setDeletingPageId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [retryingPageId, setRetryingPageId] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPages() {
      setIsLoading(true);
      setError('');

      try {
        const saved = await getSavedPages();
        if (isMounted) {
          setPages(saved);
        }
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
  }, [refreshKey]);

  useEffect(() => {
    if (!pages.some((page) => page.indexingStatus === 'pending' || page.indexingStatus === 'indexing')) return;

    const intervalId = setInterval(() => {
      setRefreshKey((value) => value + 1);
    }, 1000);
    return () => clearInterval(intervalId);
  }, [pages]);

  async function toggleChunks(pageId: number) {
    if (expandedPageId === pageId) {
      setExpandedPageId(null);
      return;
    }

    setExpandedPageId(pageId);
    if (chunkPreviews[pageId]) return;

    setLoadingChunkPageId(pageId);
    setPageErrors((current) => ({ ...current, [pageId]: '' }));
    try {
      const chunks = await getPageChunks(pageId);
      setChunkPreviews((current) => ({ ...current, [pageId]: chunks }));
    } catch {
      setPageErrors((current) => ({ ...current, [pageId]: 'Chunks could not be loaded from local storage.' }));
    } finally {
      setLoadingChunkPageId(null);
    }
  }

  async function removePage(page: SavedPage) {
    if (page.id === undefined || !window.confirm(`Delete "${page.title}" from local memory?`)) return;

    setDeletingPageId(page.id);
    setPageErrors((current) => ({ ...current, [page.id!]: '' }));
    try {
      await deletePage(page.id);
      setPages((current) => current.filter((savedPage) => savedPage.id !== page.id));
      setChunkPreviews((current) => {
        const next = { ...current };
        delete next[page.id!];
        return next;
      });
      setExpandedPageId((current) => current === page.id ? null : current);
    } catch {
      setPageErrors((current) => ({ ...current, [page.id!]: 'This page could not be deleted from local storage.' }));
    } finally {
      setDeletingPageId(null);
    }
  }

  async function retryIndexing(pageId: number) {
    setRetryingPageId(pageId);
    setPageErrors((current) => ({ ...current, [pageId]: '' }));
    try {
      const response = await browser.runtime.sendMessage({
        pageId,
        type: 'RETRY_PAGE_INDEXING',
        version: 1,
      }) as { ok?: boolean };
      if (!response.ok) throw new Error('Retry was rejected.');
      setRefreshKey((value) => value + 1);
    } catch {
      setPageErrors((current) => ({ ...current, [pageId]: 'Indexing could not be restarted. Please try again.' }));
    } finally {
      setRetryingPageId(null);
    }
  }

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
    return text.length > 200 ? `${text.slice(0, 200)}...` : text;
  }

  function indexingLabel(page: SavedPage): string {
    if (page.indexingStatus === 'indexed') return 'Indexed';
    if (page.indexingStatus === 'failed') return 'Failed';
    if (page.indexingPhase === 'loading-model') return 'Loading model';
    if (page.indexingStatus === 'indexing') return `Indexing ${page.indexedChunkCount} of ${page.chunkCount}`;
    return 'Not indexed';
  }

  return (
    <main>
      <header className="dashboard-header">
        <span className="mark">LWM</span>
        <span>{PROJECT_NAME}</span>
      </header>

      <div className="layout-grid">
        <section className="hero-section">
          <p className="eyebrow">Milestone 4: Local Embeddings</p>
          <h1>Your corner of the web,<br />remembered locally.</h1>

          <div className="search-box">
            <label htmlFor="memory-search">Search your web memory</label>
            <input id="memory-search" type="search" placeholder={SEARCH_PLACEHOLDER} disabled />
          </div>

          <aside className="milestone-badge">
            <strong>Local Indexing</strong>
            <p>Chunks are embedded locally on this device. Semantic search is scheduled for a future milestone.</p>
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
              {pages.map((page) => {
                const pageId = page.id;
                const chunks = pageId === undefined ? undefined : chunkPreviews[pageId];
                const isExpanded = pageId === expandedPageId;
                const isLoadingChunks = pageId === loadingChunkPageId;
                const isDeleting = pageId === deletingPageId;

                return (
                  <article key={page.id ?? page.url} className="page-card">
                    <header className="card-header">
                      <span className="card-domain">{getHostname(page.url)}</span>
                      <span className="card-date">{formatDate(page.savedAt)}</span>
                    </header>

                    <h3 className="card-title">{page.title}</h3>
                    <p className="card-snippet">{getSnippet(page.text)}</p>
                    <p className="card-metadata">
                      {(page.cleanedTextLength ?? page.text.length).toLocaleString()} cleaned characters · {page.chunkCount ?? 0} chunks
                    </p>
                    <p className={`indexing-status indexing-status-${page.indexingStatus}`}>
                      {indexingLabel(page)} · {page.indexedChunkCount} of {page.chunkCount} embedded
                    </p>

                    {page.truncated && (
                      <span className="badge badge-warning" title="This page was very large and was truncated to 500,000 characters.">
                        Truncated
                      </span>
                    )}

                    {pageId !== undefined && (
                      <div className="card-actions">
                        <button
                          type="button"
                          className="chunk-toggle"
                          aria-expanded={isExpanded}
                          onClick={() => void toggleChunks(pageId)}
                        >
                          {isExpanded ? 'Hide chunks' : 'Show chunks'}
                        </button>
                        <button
                          type="button"
                          className="delete-page"
                          disabled={isDeleting}
                          aria-label={`Delete ${page.title}`}
                          onClick={() => void removePage(page)}
                        >
                          {isDeleting ? 'Deleting...' : 'Delete'}
                        </button>
                        {page.indexingStatus !== 'indexed' && (
                          <button
                            type="button"
                            className="retry-indexing"
                            disabled={retryingPageId === pageId}
                            onClick={() => void retryIndexing(pageId)}
                          >
                            {retryingPageId === pageId ? 'Retrying...' : 'Retry indexing'}
                          </button>
                        )}
                      </div>
                    )}

                    {pageId !== undefined && pageErrors[pageId] && (
                      <p className="page-error" role="alert">{pageErrors[pageId]}</p>
                    )}

                    {isExpanded && pageId !== undefined && (
                      <section className="chunk-preview" aria-label={`Chunks for ${page.title}`}>
                        {isLoadingChunks ? (
                          <p className="loading">Loading chunks...</p>
                        ) : chunks?.length ? (
                          chunks.map((chunk) => (
                            <div key={chunk.position} className="chunk-item">
                              <strong>Chunk {chunk.position + 1}</strong>
                              <span>{chunk.characterCount.toLocaleString()} characters</span>
                              <span>{chunk.embeddingStatus}{chunk.embeddingDimension ? ` · ${chunk.embeddingDimension} dimensions` : ''}</span>
                              <p>{chunk.text}</p>
                            </div>
                          ))
                        ) : (
                          <p className="chunk-empty">No chunks are available for this page.</p>
                        )}
                      </section>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

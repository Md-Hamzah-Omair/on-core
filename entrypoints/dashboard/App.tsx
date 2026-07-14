import { type FormEvent, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { deletePage, getLocalDataSummary, getPageChunks, getSavedPages } from '../../lib/database';
import { formatStorageEstimate, LOCAL_RUNTIME_DETAILS, type LocalDataSummary } from '../../lib/privacy-settings';
import { articleMetadataLabel, extractionMethodLabel, formatSavedDate, hybridRelevanceLabel, indexingErrorMessage, isCurrentSearchResponse, searchErrorMessage } from '../../lib/dashboard-state';
import { PROJECT_NAME, SEARCH_PLACEHOLDER } from '../../lib/project';
import type { SavedPage } from '../../lib/pages';
import type { StoredTextChunk } from '../../lib/text-chunking';
import { DEFAULT_SEARCH_RESULT_LIMIT, validateSearchQuery, type SemanticSearchResult } from '../../lib/semantic-search';

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
  const [query, setQuery] = useState('');
  const [searchLimit, setSearchLimit] = useState(DEFAULT_SEARCH_RESULT_LIMIT);
  const [searchState, setSearchState] = useState<'idle' | 'validating-query' | 'loading-model' | 'embedding-query' | 'searching' | 'results' | 'no-results' | 'failed'>('idle');
  const [searchError, setSearchError] = useState('');
  const [searchResults, setSearchResults] = useState<SemanticSearchResult[]>([]);
  const [summary, setSummary] = useState<LocalDataSummary | null>(null);
  const [storageUsage, setStorageUsage] = useState<number | undefined>();
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const activeSearchId = useRef<string | null>(null);

  useEffect(() => () => {
    if (activeSearchId.current) {
      void browser.runtime.sendMessage({ requestId: activeSearchId.current, type: 'CANCEL_SEARCH', version: 1 });
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadPages() {
      setIsLoading(true);
      setError('');

      try {
        const saved = await getSavedPages();
        if (isMounted) {
          setPages(saved);
          const localSummary = await getLocalDataSummary();
          if (isMounted) setSummary(localSummary);
          const estimate = await navigator.storage?.estimate?.();
          if (isMounted) setStorageUsage(estimate?.usage);
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
      setSearchResults((current) => current.filter((result) => result.pageId !== page.id));
      setRefreshKey((value) => value + 1);
    } catch {
      setPageErrors((current) => ({ ...current, [page.id!]: 'This page could not be deleted from local storage.' }));
    } finally {
      setDeletingPageId(null);
    }
  }

  async function removeAllPages() {
    if (!pages.length || !window.confirm(`Delete all ${pages.length} saved pages and their chunks from this browser? This cannot be undone.`)) return;
    setIsDeletingAll(true);
    try {
      const response = await browser.runtime.sendMessage({ type: 'DELETE_ALL_LOCAL_DATA', version: 1 }) as { ok?: boolean };
      if (!response.ok) throw new Error('Delete all was rejected.');
      activeSearchId.current = null;
      setPages([]); setChunkPreviews({}); setExpandedPageId(null); setSearchResults([]); setSearchState('idle'); setQuery(''); setSummary(null); setStorageUsage(undefined);
    } catch {
      setError('All local data could not be deleted. Please try again.');
    } finally {
      setIsDeletingAll(false);
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

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeSearchId.current) {
      void browser.runtime.sendMessage({ requestId: activeSearchId.current, type: 'CANCEL_SEARCH', version: 1 });
      activeSearchId.current = null;
    }
    const validation = validateSearchQuery(query);
    setSearchState('validating-query');
    setSearchError('');
    if (!validation.valid) {
      setSearchError(validation.message);
      setSearchState('failed');
      return;
    }
    const requestId = crypto.randomUUID();
    activeSearchId.current = requestId;
    setSearchState('searching');
    try {
      const response = await browser.runtime.sendMessage({ limit: searchLimit, query: validation.normalized, requestId, type: 'SEARCH_MEMORY', version: 1 }) as { ok: boolean; requestId: string; results?: SemanticSearchResult[]; status?: string; code?: string };
      if (!isCurrentSearchResponse(activeSearchId.current, requestId) || response.requestId !== requestId) return;
      if (!response.ok) throw new Error(response.code ?? 'SEARCH_FAILED');
      setSearchResults(response.results ?? []);
      if (response.status === 'no-indexed-content') setSearchError(searchErrorMessage('NO_INDEXED_CONTENT'));
      setSearchState(response.status === 'results' ? 'results' : 'no-results');
    } catch (error) {
      if (activeSearchId.current === requestId) {
        setSearchError(searchErrorMessage(error instanceof Error ? error.message : 'SEARCH_FAILED'));
        setSearchState('failed');
      }
    } finally {
      if (activeSearchId.current === requestId) activeSearchId.current = null;
    }
  }

  function clearSearch() {
    if (activeSearchId.current) void browser.runtime.sendMessage({ requestId: activeSearchId.current, type: 'CANCEL_SEARCH', version: 1 });
    activeSearchId.current = null;
    setQuery('');
    setSearchResults([]);
    setSearchError('');
    setSearchState('idle');
  }

  function getHostname(urlStr: string): string {
    try {
      return new URL(urlStr).hostname;
    } catch {
      return urlStr;
    }
  }

  function formatDate(timestamp: number): string {
    return formatSavedDate(timestamp);
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
          <p className="eyebrow">Private, local web memory</p>
          <h1>Your corner of the web,<br />remembered locally.</h1>

          <form className="search-box" onSubmit={(event) => void submitSearch(event)}>
            <label htmlFor="memory-search">Search your web memory</label>
            <input id="memory-search" type="search" maxLength={500} placeholder={SEARCH_PLACEHOLDER} value={query} onChange={(event) => setQuery(event.target.value)} />
            <div className="search-actions">
              <select aria-label="Search result limit" value={searchLimit} onChange={(event) => setSearchLimit(Number(event.target.value))}>
                <option value={5}>5 results</option><option value={10}>10 results</option><option value={20}>20 results</option>
              </select>
              <button type="submit" disabled={searchState === 'searching'}>Search locally</button>
              {searchState !== 'idle' && <button type="button" onClick={clearSearch}>Clear</button>}
            </div>
            {searchState === 'searching' && <p className="search-state" role="status">Searching locally...</p>}
            {searchError && <p className="page-error" role="alert">{searchError}</p>}
          </form>

          <aside className="milestone-badge">
            <strong>Private Hybrid Search</strong>
            <p>Meaning, keywords, and save recency are ranked on this device.</p>
          </aside>
          <section className="privacy-panel" aria-label="Privacy and local storage">
            <h2>Privacy &amp; Local Storage</h2>
            <p>Capture happens only when you click Save Page. No telemetry, cloud inference, sync, or automatic capture is used.</p>
            <p><strong>Permissions:</strong> activeTab for your explicit save action, scripting for one-time extraction, and offscreen for local model work. Host permissions: none.</p>
            <p><strong>Model:</strong> {LOCAL_RUNTIME_DETAILS.modelId} ({LOCAL_RUNTIME_DETAILS.dimension} dimensions, embedding v{LOCAL_RUNTIME_DETAILS.embeddingVersion})</p>
            <p><strong>Runtime:</strong> {LOCAL_RUNTIME_DETAILS.runtime}. Bundled locally; external inference: none.</p>
            <p><strong>Saved:</strong> {summary?.pageCount ?? 0} pages, {summary?.chunkCount ?? 0} chunks. Approximate browser storage: {formatStorageEstimate(storageUsage)}.</p>
            <p>Stored data remains in this browser profile until deleted, extension data is cleared, or the extension is uninstalled. It is not application-level encrypted. Opening an original page contacts that website.</p>
            <button type="button" className="delete-all" disabled={isDeletingAll || pages.length === 0} onClick={() => void removeAllPages()}>{isDeletingAll ? 'Deleting all...' : 'Delete all local data'}</button>
          </section>
        </section>

        <section className="feed-section">
          <h2>{searchState === 'results' || searchState === 'no-results' ? 'Search Results' : `Saved Memories (${pages.length})`}</h2>

          {searchState === 'results' ? (
            <div className="pages-list">{searchResults.map((result) => (
              <article key={result.pageId} className="page-card search-result">
                <header className="card-header"><span className="card-domain">{getHostname(result.url)}</span><span className="card-date">{formatDate(result.savedAt)}</span></header>
                <h3 className="card-title">{result.title}</h3>
                <p className="semantic-label">{hybridRelevanceLabel(result.score)}</p>
                <p className="card-snippet semantic-snippet">{result.snippet}</p>
                <a className="open-original" href={result.url} target="_blank" rel="noreferrer">Open original</a>
              </article>
            ))}</div>
          ) : searchState === 'no-results' ? (
            <div className="empty-state"><p>No relevant matches found.</p><span>Try a different description or wait for pages to finish indexing.</span></div>
          ) : isLoading ? (
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
                       {extractionMethodLabel(page.extractionMethod)} · {(page.cleanedTextLength ?? page.text.length).toLocaleString()} extracted characters · {page.chunkCount ?? 0} chunks
                    </p>
                    {articleMetadataLabel(page) && <p className="card-article-metadata">{articleMetadataLabel(page)}</p>}
                    <p className={`indexing-status indexing-status-${page.indexingStatus}`}>
                      {indexingLabel(page)} · {page.indexedChunkCount} of {page.chunkCount} embedded
                    </p>
                    {page.indexingError && <p className="page-error">{indexingErrorMessage(page.indexingError)}</p>}

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

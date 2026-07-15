import { useEffect, useRef, useState, type FormEvent } from 'react';
import { browser } from 'wxt/browser';
import { ToastRegion, type ToastMessage } from '../../components/ToastRegion';
import { deletePage, getLocalDataSummary, getPageChunks, getSavedPages } from '../../lib/database';
import { isCurrentSearchProgress, isCurrentSearchResponse, searchErrorMessage, searchProgressLabel, formatSearchSummary, type SavedMemoryFilter } from '../../lib/dashboard-state';
import { isSearchProgressMessage } from '../../lib/messages';
import type { SavedPage } from '../../lib/pages';
import type { LocalDataSummary } from '../../lib/privacy-settings';
import { validateSearchQuery, type SemanticSearchResult } from '../../lib/semantic-search';
import type { StoredTextChunk } from '../../lib/text-chunking';
import { readSearchResultLimit, writeSearchResultLimit, type SearchResultLimit } from '../../lib/ui-preferences';
import { DashboardNavigation } from './components/DashboardNavigation';
import { PrivacySummary } from './components/PrivacySummary';
import { SavedMemories } from './components/SavedMemories';
import { SearchPanel } from './components/SearchPanel';
import { SearchResults } from './components/SearchResults';

type SearchState = 'idle' | 'searching' | 'results' | 'no-results' | 'failed';
type SearchResponse = {
  candidateChunkCount?: number;
  code?: string;
  ok: boolean;
  requestId: string;
  results?: SemanticSearchResult[];
  status?: 'no-indexed-content' | 'results' | 'no-results';
};

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
  const [filter, setFilter] = useState<SavedMemoryFilter>('all');
  const [query, setQuery] = useState('');
  const [searchLimit, setSearchLimit] = useState<SearchResultLimit>(() => readSearchResultLimit());
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [searchProgress, setSearchProgress] = useState('Preparing local search...');
  const [searchError, setSearchError] = useState('');
  const [searchSummary, setSearchSummary] = useState('');
  const [searchResults, setSearchResults] = useState<SemanticSearchResult[]>([]);
  const [summary, setSummary] = useState<LocalDataSummary | null>(null);
  const [storageUsage, setStorageUsage] = useState<number | undefined>();
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const activeSearchId = useRef<string | null>(null);
  const activeSearchParameters = useRef<{ limit: number; query: string } | null>(null);
  const lastSubmittedQuery = useRef('');
  const previousIndexingStatuses = useRef<Map<number, SavedPage['indexingStatus']> | null>(null);
  const loadedOnce = useRef(false);

  function addToast(message: string, tone: ToastMessage['tone'] = 'info') {
    setToasts((current) => [...current, { id: crypto.randomUUID(), message, tone }]);
  }

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((toast) => setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 4000));
    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  useEffect(() => () => {
    if (activeSearchId.current) void browser.runtime.sendMessage({ requestId: activeSearchId.current, type: 'CANCEL_SEARCH', version: 1 });
  }, []);

  useEffect(() => {
    const onMessage = (message: unknown) => {
      if (isSearchProgressMessage(message) && isCurrentSearchProgress(activeSearchId.current, message.requestId)) {
        setSearchProgress(searchProgressLabel(message.phase));
      }
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadPages() {
      if (!loadedOnce.current) setIsLoading(true);
      setError('');
      try {
        const saved = await getSavedPages();
        if (!mounted) return;
        setPages(saved);
        const nextStatuses = new Map(saved.flatMap((page) => page.id === undefined ? [] : [[page.id, page.indexingStatus] as const]));
        if (previousIndexingStatuses.current) {
          for (const page of saved) {
            if (page.id === undefined) continue;
            const previous = previousIndexingStatuses.current.get(page.id);
            if ((previous === 'pending' || previous === 'indexing') && page.indexingStatus === 'indexed') addToast(`Indexed “${page.title}”.`, 'success');
            if ((previous === 'pending' || previous === 'indexing') && page.indexingStatus === 'failed') addToast(`Indexing failed for “${page.title}”.`, 'error');
          }
        }
        previousIndexingStatuses.current = nextStatuses;
        loadedOnce.current = true;
        const [localSummary, estimate] = await Promise.all([
          getLocalDataSummary(),
          navigator.storage?.estimate?.().catch(() => undefined),
        ]);
        if (mounted) { setSummary(localSummary); setStorageUsage(estimate?.usage); }
      } catch {
        if (mounted) setError('Saved pages could not be loaded from local storage.');
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    void loadPages();
    const refreshOnFocus = () => void loadPages();
    window.addEventListener('focus', refreshOnFocus);
    return () => { mounted = false; window.removeEventListener('focus', refreshOnFocus); };
  }, [refreshKey]);

  useEffect(() => {
    if (!pages.some((page) => page.indexingStatus === 'pending' || page.indexingStatus === 'indexing')) return;
    const intervalId = setInterval(() => setRefreshKey((value) => value + 1), 1000);
    return () => clearInterval(intervalId);
  }, [pages]);

  async function toggleChunks(pageId: number) {
    if (expandedPageId === pageId) { setExpandedPageId(null); return; }
    setExpandedPageId(pageId);
    if (chunkPreviews[pageId]) return;
    setLoadingChunkPageId(pageId);
    setPageErrors((current) => ({ ...current, [pageId]: '' }));
    try {
      const chunks = await getPageChunks(pageId);
      setChunkPreviews((current) => ({ ...current, [pageId]: chunks }));
    } catch {
      setPageErrors((current) => ({ ...current, [pageId]: 'Chunks could not be loaded from local storage.' }));
    } finally { setLoadingChunkPageId(null); }
  }

  async function removePage(page: SavedPage): Promise<boolean> {
    if (page.id === undefined) return false;
    if (activeSearchId.current) {
      void browser.runtime.sendMessage({ requestId: activeSearchId.current, type: 'CANCEL_SEARCH', version: 1 });
      activeSearchId.current = null;
      activeSearchParameters.current = null;
      setSearchState(searchResults.length ? 'results' : 'idle');
    }
    setDeletingPageId(page.id);
    setPageErrors((current) => ({ ...current, [page.id!]: '' }));
    try {
      await deletePage(page.id);
      setPages((current) => current.filter((savedPage) => savedPage.id !== page.id));
      setChunkPreviews((current) => { const next = { ...current }; delete next[page.id!]; return next; });
      setExpandedPageId((current) => current === page.id ? null : current);
      setSearchResults((current) => current.filter((result) => result.pageId !== page.id));
      addToast('Saved memory deleted.', 'success');
      setRefreshKey((value) => value + 1);
      return true;
    } catch {
      setPageErrors((current) => ({ ...current, [page.id!]: 'This page could not be deleted from local storage.' }));
      return false;
    } finally { setDeletingPageId(null); }
  }

  async function removeAllPages(): Promise<boolean> {
    setIsDeletingAll(true);
    if (activeSearchId.current) void browser.runtime.sendMessage({ requestId: activeSearchId.current, type: 'CANCEL_SEARCH', version: 1 });
    try {
      const response = await browser.runtime.sendMessage({ type: 'DELETE_ALL_LOCAL_DATA', version: 1 }) as { ok?: boolean };
      if (!response.ok) throw new Error('Delete all was rejected.');
      activeSearchId.current = null;
      activeSearchParameters.current = null;
      lastSubmittedQuery.current = '';
      setPages([]); setChunkPreviews({}); setExpandedPageId(null); setSearchResults([]); setSearchState('idle'); setQuery(''); setSummary(null); setStorageUsage(undefined);
      addToast('All saved memories were deleted.', 'success');
      return true;
    } catch {
      setError('All saved memories could not be deleted. Please try again.');
      return false;
    } finally { setIsDeletingAll(false); }
  }

  async function retryIndexing(pageId: number) {
    setRetryingPageId(pageId);
    setPageErrors((current) => ({ ...current, [pageId]: '' }));
    try {
      const response = await browser.runtime.sendMessage({ pageId, type: 'RETRY_PAGE_INDEXING', version: 1 }) as { ok?: boolean };
      if (!response.ok) throw new Error('Retry was rejected.');
      addToast('Indexing retry started.');
      setRefreshKey((value) => value + 1);
    } catch {
      setPageErrors((current) => ({ ...current, [pageId]: 'Indexing could not be restarted. Please try again.' }));
    } finally { setRetryingPageId(null); }
  }

  async function executeSearch(normalizedQuery: string, limit: SearchResultLimit) {
    const active = activeSearchParameters.current;
    if (activeSearchId.current && active?.query === normalizedQuery && active.limit === limit) return;
    if (activeSearchId.current) void browser.runtime.sendMessage({ requestId: activeSearchId.current, type: 'CANCEL_SEARCH', version: 1 });
    const requestId = crypto.randomUUID();
    const startedAt = performance.now();
    activeSearchId.current = requestId;
    activeSearchParameters.current = { limit, query: normalizedQuery };
    lastSubmittedQuery.current = normalizedQuery;
    setSearchState('searching'); setSearchProgress('Preparing local search...'); setSearchError(''); setSearchSummary(''); setSearchResults([]);
    try {
      const response = await browser.runtime.sendMessage({ limit, query: normalizedQuery, requestId, type: 'SEARCH_MEMORY', version: 1 }) as SearchResponse;
      if (!isCurrentSearchResponse(activeSearchId.current, requestId) || response.requestId !== requestId) return;
      if (!response.ok) throw new Error(response.code ?? 'SEARCH_FAILED');
      const results = response.results ?? [];
      setSearchResults(results);
      setSearchSummary(formatSearchSummary(results.length, response.candidateChunkCount ?? 0, performance.now() - startedAt));
      if (response.status === 'no-indexed-content') setSearchError(searchErrorMessage('NO_INDEXED_CONTENT'));
      setSearchState(response.status === 'results' ? 'results' : 'no-results');
    } catch (caught) {
      if (activeSearchId.current === requestId) { setSearchError(searchErrorMessage(caught instanceof Error ? caught.message : 'SEARCH_FAILED')); setSearchState('failed'); }
    } finally {
      if (activeSearchId.current === requestId) { activeSearchId.current = null; activeSearchParameters.current = null; }
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateSearchQuery(query);
    setSearchError('');
    if (!validation.valid) {
      if (activeSearchId.current) void browser.runtime.sendMessage({ requestId: activeSearchId.current, type: 'CANCEL_SEARCH', version: 1 });
      activeSearchId.current = null; activeSearchParameters.current = null; lastSubmittedQuery.current = '';
      setSearchResults([]); setSearchSummary(''); setSearchError(validation.message); setSearchState('failed');
      return;
    }
    void executeSearch(validation.normalized, searchLimit);
  }

  function changeSearchLimit(limit: SearchResultLimit) {
    writeSearchResultLimit(limit);
    setSearchLimit(limit);
    if (lastSubmittedQuery.current) void executeSearch(lastSubmittedQuery.current, limit);
  }

  function clearSearch() {
    if (activeSearchId.current) void browser.runtime.sendMessage({ requestId: activeSearchId.current, type: 'CANCEL_SEARCH', version: 1 });
    activeSearchId.current = null; activeSearchParameters.current = null; lastSubmittedQuery.current = '';
    setQuery(''); setSearchResults([]); setSearchError(''); setSearchSummary(''); setSearchState('idle');
  }

  const searching = searchState === 'searching';
  return (
    <>
      <a className="skip-link" href="#search">Skip to search</a>
      <div className="dashboard-app">
        <DashboardNavigation />
        <main className="dashboard-shell">
          <SearchPanel error={searchError} isSearching={searching} limit={searchLimit} onClear={clearSearch} onLimitChange={changeSearchLimit} onQueryChange={setQuery} onSubmit={submitSearch} progressLabel={searchProgress} query={query} showClear={searchState !== 'idle'} />
          <SearchResults isLoading={searching} results={searchResults} showNoResults={searchState === 'no-results'} summary={searchSummary} />
          {error && <p className="page-load-error" role="alert">{error}</p>}
          <div className="management-grid">
            <SavedMemories chunkPreviews={chunkPreviews} deletingPageId={deletingPageId} expandedPageId={expandedPageId} filter={filter} loadingChunkPageId={loadingChunkPageId} onDelete={removePage} onFilterChange={setFilter} onRetry={retryIndexing} onToggleChunks={toggleChunks} pageErrors={pageErrors} pages={pages} retryingPageId={retryingPageId} />
            <PrivacySummary deleting={isDeletingAll} onDeleteAll={removeAllPages} storageUsage={storageUsage} summary={summary} />
          </div>
          {isLoading && <p className="initial-loading" role="status">Loading saved memories...</p>}
        </main>
      </div>
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
    </>
  );
}

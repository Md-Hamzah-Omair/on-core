import { useState } from 'react';
import { Badge } from '../../../components/Badge';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { Progress } from '../../../components/Progress';
import { createSavedSnippet, deriveIndexingPresentation, extractionMethodLabel, filterSavedPages, formatSavedDate, safeHostname, safePageUrl, savedDateTime, type SavedMemoryFilter } from '../../../lib/dashboard-state';
import type { SavedPage } from '../../../lib/pages';
import type { StoredTextChunk } from '../../../lib/text-chunking';

interface SavedMemoriesProps {
  chunkPreviews: Record<number, StoredTextChunk[]>;
  deletingPageId: number | null;
  expandedPageId: number | null;
  filter: SavedMemoryFilter;
  loadingChunkPageId: number | null;
  onDelete: (page: SavedPage) => Promise<boolean>;
  onFilterChange: (filter: SavedMemoryFilter) => void;
  onRetry: (pageId: number) => Promise<void>;
  onToggleChunks: (pageId: number) => Promise<void>;
  pageErrors: Record<number, string>;
  pages: SavedPage[];
  retryingPageId: number | null;
}

export function SavedMemories(props: SavedMemoriesProps) {
  const [deleteTarget, setDeleteTarget] = useState<SavedPage | null>(null);
  const visiblePages = filterSavedPages(props.pages, props.filter);
  return (
    <section className="saved-section" id="saved-memories" aria-labelledby="saved-heading">
      <div className="section-heading-row saved-heading-row">
        <div><p className="section-kicker">Your library</p><h2 id="saved-heading">Saved memories <span>({props.pages.length})</span></h2></div>
        <label className="filter-control">Status
          <select value={props.filter} onChange={(event) => props.onFilterChange(event.target.value as SavedMemoryFilter)}>
            <option value="all">All</option><option value="in-progress">In progress</option><option value="indexed">Indexed</option><option value="failed">Failed</option>
          </select>
        </label>
      </div>
      {props.pages.length === 0 ? <Card className="empty-state"><h3>Your web memory is empty</h3><p>Open a webpage and use the extension popup to save it locally.</p></Card> : visiblePages.length === 0 ? <Card className="empty-state"><h3>No pages match this filter</h3><p>Choose another indexing status to see saved pages.</p></Card> : (
        <div className="saved-list">
          {visiblePages.map((page) => {
            const pageId = page.id;
            const presentation = deriveIndexingPresentation(page);
            const chunks = pageId === undefined ? undefined : props.chunkPreviews[pageId];
            const expanded = pageId === props.expandedPageId;
            const url = safePageUrl(page.url);
            const dateTime = savedDateTime(page.savedAt);
            const chunkSectionId = pageId === undefined ? undefined : `page-${pageId}-chunks`;
            return (
              <Card key={page.id ?? page.url} className="saved-card" aria-busy={page.indexingStatus === 'pending' || page.indexingStatus === 'indexing'}>
                <header className="card-header"><span className="source-pill">{safeHostname(page.url)}</span><Badge tone={presentation.tone}>{presentation.label}</Badge></header>
                <h3 className="card-title">{url ? <a href={url} target="_blank" rel="noreferrer" aria-label={`${page.title}, open original in a new tab`}>{page.title}</a> : page.title}</h3>
                <p className="card-snippet saved-snippet">{createSavedSnippet(page.text)}</p>
                <div className="metadata-row"><Badge>{extractionMethodLabel(page.extractionMethod)}</Badge><span>{page.chunkCount ?? 0} chunks</span></div>
                <div className="indexing-block" role="status" aria-live={page.indexingStatus === 'failed' ? 'assertive' : 'off'}>
                  <div className="indexing-heading"><span>Local indexing</span>{presentation.maximum && <span>{presentation.current} of {presentation.maximum} embedded{presentation.percent !== undefined ? ` · ${presentation.percent}%` : ''}</span>}</div>
                  <Progress label={`${presentation.label} for ${page.title}`} max={presentation.maximum ?? 100} value={presentation.maximum ? presentation.current : undefined} />
                </div>
                {page.indexingError && <p className="inline-error" role="alert">{page.indexingError}</p>}
                <div className="card-actions">
                  {url ? <a className="open-original" href={url} target="_blank" rel="noreferrer">Open page <span aria-hidden="true">↗</span><span className="ui-visually-hidden">in a new tab</span></a> : <span className="unavailable-link">Original URL unavailable</span>}
                  {pageId !== undefined && presentation.retryable && <Button variant="secondary" size="small" loading={props.retryingPageId === pageId} loadingLabel="Retrying..." onClick={() => void props.onRetry(pageId)}>Retry indexing</Button>}
                  {pageId !== undefined && <Button className="delete-memory" variant="quiet" size="small" disabled={props.deletingPageId === pageId} onClick={() => setDeleteTarget(page)}>Delete</Button>}
                </div>
                {pageId !== undefined && props.pageErrors[pageId] && <p className="inline-error" role="alert">{props.pageErrors[pageId]}</p>}
                <details className="memory-details">
                  <summary>Memory details</summary>
                  <dl className="memory-metadata">
                    <div><dt>Author</dt><dd>{page.byline ?? 'Not provided'}</dd></div>
                    <div><dt>Language</dt><dd>{page.language ?? 'Not provided'}</dd></div>
                    <div><dt>Site name</dt><dd>{page.siteName ?? 'Not provided'}</dd></div>
                    <div><dt>Captured</dt><dd>{dateTime ? <time dateTime={dateTime}>{formatSavedDate(page.savedAt)}</time> : 'Unknown save date'}</dd></div>
                    <div><dt>Exact length</dt><dd>{(page.cleanedTextLength ?? page.text.length).toLocaleString()} characters</dd></div>
                    <div><dt>Extraction</dt><dd>{extractionMethodLabel(page.extractionMethod)}{page.truncated ? ' · truncated' : ''}</dd></div>
                    <div><dt>Index state</dt><dd>{page.indexingStatus} · {page.indexingPhase}</dd></div>
                    <div><dt>Content revision</dt><dd>{page.contentRevision}</dd></div>
                    <div><dt>Embedding</dt><dd>{page.embeddingModelId} · {page.embeddingModelRevision} · version {page.embeddingVersion}</dd></div>
                  </dl>
                  {page.excerpt && <p className="memory-excerpt"><strong>Extracted summary</strong>{page.excerpt}</p>}
                  {pageId !== undefined && <Button variant="outlined" size="small" aria-expanded={expanded} aria-controls={chunkSectionId} onClick={() => void props.onToggleChunks(pageId)}>{expanded ? 'Hide chunk details' : `Show ${page.chunkCount ?? 0} chunk details`}</Button>}
                  {expanded && pageId !== undefined && <section id={chunkSectionId} className="chunk-preview" aria-label={`Chunks for ${page.title}`}>
                    {props.loadingChunkPageId === pageId ? <p role="status">Loading chunks...</p> : chunks?.length ? chunks.map((chunk) => <div key={chunk.position} className="chunk-item"><strong>Chunk {chunk.position + 1}</strong><span>{chunk.characterCount.toLocaleString()} characters · {chunk.embeddingStatus}</span><p>{chunk.text}</p></div>) : <p>No chunks are available for this page.</p>}
                  </section>}
                </details>
              </Card>
            );
          })}
        </div>
      )}
      <ConfirmDialog open={deleteTarget !== null} title="Delete saved memory?" description={deleteTarget ? `“${deleteTarget.title}” and its local chunks will be permanently removed.` : undefined} confirmLabel="Delete memory" danger loading={deleteTarget?.id === props.deletingPageId} onCancel={() => setDeleteTarget(null)} onConfirm={() => { if (deleteTarget) void props.onDelete(deleteTarget).then((deleted) => { if (deleted) setDeleteTarget(null); }); }} />
    </section>
  );
}

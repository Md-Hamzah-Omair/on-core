// @vitest-environment jsdom
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { SavedPage } from '../../../lib/pages';
import { DashboardNavigation } from './DashboardNavigation';
import { PrivacySummary } from './PrivacySummary';
import { SavedMemories } from './SavedMemories';
import { SearchPanel } from './SearchPanel';

function render(element: ReactElement): HTMLElement {
  document.body.innerHTML = renderToStaticMarkup(element);
  return document.body;
}

const savedPage: SavedPage = {
  byline: 'Ada Example',
  chunkCount: 4,
  cleanedTextLength: 240,
  contentRevision: 1,
  embeddingModelId: 'local-model',
  embeddingModelRevision: 'bundled',
  embeddingVersion: 1,
  extractionMethod: 'readability',
  id: 7,
  indexedChunkCount: 2,
  indexingPhase: 'embedding',
  indexingStatus: 'indexing',
  language: 'en',
  savedAt: Date.UTC(2026, 0, 2),
  siteName: 'Example',
  text: 'A compact saved-page summary used to verify the progressive disclosure structure.',
  title: 'A saved memory',
  truncated: false,
  url: 'https://example.com/article',
};

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('dashboard UI structure', () => {
  it('links the floating navigation to each dashboard section', () => {
    const root = render(<DashboardNavigation />);
    const navigation = root.querySelector('nav[aria-label="Dashboard sections"]');
    const hrefs = Array.from(navigation?.querySelectorAll('.nav-links a') ?? [], (link) => link.getAttribute('href'));

    expect(hrefs).toEqual(['#search', '#saved-memories', '#privacy-settings']);
  });

  it('provides an accessible theme control', () => {
    const root = render(<DashboardNavigation />);
    const select = root.querySelector<HTMLSelectElement>('#theme-preference');

    expect(select).not.toBeNull();
    expect(select?.labels[0]?.textContent).toContain('Theme');
  });

  it('provides a native, labelled result-count control', () => {
    const root = render(<SearchPanel error="" isSearching={false} limit={3} onClear={() => {}} onLimitChange={() => {}} onQueryChange={() => {}} onSubmit={() => {}} progressLabel="Preparing local search..." query="" showClear={false} />);
    const select = root.querySelector<HTMLSelectElement>('#result-limit');

    expect(select).not.toBeNull();
    expect(select?.labels[0]?.textContent).toContain('Results');
    expect(Array.from(select?.options ?? [], (option) => option.value)).toEqual(['3', '5', '10']);
  });

  it('keeps memory details collapsed and binds progress to indexing state', () => {
    const root = render(<SavedMemories chunkPreviews={{}} deletingPageId={null} expandedPageId={null} filter="all" loadingChunkPageId={null} onDelete={async () => true} onFilterChange={() => {}} onRetry={async () => {}} onToggleChunks={async () => {}} pageErrors={{}} pages={[savedPage]} retryingPageId={null} />);
    const details = root.querySelector<HTMLDetailsElement>('.memory-details');
    const progress = root.querySelector<HTMLProgressElement>('.indexing-block progress');

    expect(details?.open).toBe(false);
    expect(details?.querySelector('summary')?.textContent).toBe('Memory details');
    expect(progress?.max).toBe(4);
    expect(progress?.value).toBe(2);
  });

  it('keeps technical privacy details collapsed by default', () => {
    const root = render(<PrivacySummary deleting={false} onDeleteAll={async () => true} summary={{ chunkCount: 5, chunkStatuses: { failed: 0, indexed: 4, indexing: 1, pending: 0 }, pageCount: 2, pageStatuses: { failed: 0, indexed: 1, indexing: 1, pending: 0 } }} />);
    const details = root.querySelector<HTMLDetailsElement>('.technical-details');

    expect(details?.open).toBe(false);
    expect(details?.querySelector('summary')?.textContent).toBe('Technical details');
    expect(root.querySelector('#privacy-settings')).not.toBeNull();
  });
});

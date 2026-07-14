import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  claimPendingEmbeddings,
  commitEmbeddingResults,
  db,
  deletePage,
  deleteAllLocalData,
  getPageChunks,
  getLocalDataSummary,
  getSemanticSearchCandidates,
  LocalWebMemoryDatabase,
  recoverInterruptedIndexing,
  retryPageIndexing,
  upsertPage,
} from './database';
import { EMBEDDING_DIMENSION } from './embeddings';
import type { EmbeddingWorkerResult } from './embedding-messages';
import { preparePageForStorage, type SavedPage } from './pages';

interface LegacyPage {
  id?: number;
  savedAt: number;
  text: string;
  title: string;
  truncated: boolean;
  url: string;
}

function capture(text: string, url = 'https://example.com/article') {
  return preparePageForStorage({
    title: 'Example article',
    url,
      text,
      truncated: false,
      extractionMethod: 'body',
  });
}

type V3Page = Omit<SavedPage, 'extractionMethod' | 'byline' | 'siteName' | 'excerpt' | 'language'>;

function embeddingResult(pageId: number, position: number, contentRevision: number): EmbeddingWorkerResult {
  const embedding = new Float32Array(EMBEDDING_DIMENSION);
  embedding[0] = 1;
  return { contentRevision, embedding, ok: true, pageId, position };
}

describe('database page and chunk persistence', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterAll(() => {
    db.close();
  });

  it('stores a page and its ordered chunks together', async () => {
    const saved = await upsertPage(capture('content '.repeat(500)));

    expect(saved.id).toBeGreaterThan(0);
    expect(saved.chunkCount).toBeGreaterThan(1);
    expect(await getPageChunks(saved.id)).toHaveLength(saved.chunkCount);
    expect(saved.indexingStatus).toBe('pending');
    expect(saved.contentRevision).toBe(1);
    expect(saved.extractionMethod).toBe('body');
  });

  it('preserves the page ID and replaces all chunks when a URL is saved again', async () => {
    const first = await upsertPage(capture('first capture '.repeat(500)));
    const claimed = await claimPendingEmbeddings();
    await commitEmbeddingResults(claimed.map((item) => embeddingResult(item.pageId, item.position, item.contentRevision)));
    const replacement = await upsertPage(capture('Replacement content has enough visible text to be stored.'));

    expect(replacement.id).toBe(first.id);
    expect(replacement.chunkCount).toBe(1);
    const chunks = await getPageChunks(replacement.id);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain('Replacement content');
    expect(replacement.contentRevision).toBe(2);
    expect(chunks[0].embeddingStatus).toBe('pending');
    expect(chunks.every((chunk) => chunk.embedding === undefined)).toBe(true);
  });

  it('deletes a page and all of its chunks in one operation', async () => {
    const saved = await upsertPage(capture('content '.repeat(500)));

    await deletePage(saved.id);

    expect(await db.pages.get(saved.id)).toBeUndefined();
    expect(await getPageChunks(saved.id)).toEqual([]);
    await expect(deletePage(saved.id)).resolves.toBeUndefined();
  });

  it('upgrades v1 pages by adding cleaned metadata and chunks', async () => {
    const name = `migration-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(1).stores({ pages: '++id, &url, savedAt' });
    const legacyPages = legacy.table<LegacyPage, number>('pages');
    const id = await legacyPages.add({
      url: 'https://example.com/legacy',
      title: 'Legacy page',
      text: 'Legacy content '.repeat(100),
      savedAt: 1,
      truncated: false,
    });
    legacy.close();

    const upgraded = new LocalWebMemoryDatabase(name);
    await upgraded.open();
    const page = await upgraded.pages.get(id);
    const chunks = await upgraded.chunks.where('pageId').equals(id).sortBy('position');

    expect(page?.cleanedTextLength).toBe(page?.text.length);
    expect(page?.chunkCount).toBe(chunks.length);
    expect(chunks.length).toBeGreaterThan(0);
    expect(page?.indexingStatus).toBe('pending');
    expect(page?.contentRevision).toBe(1);
    expect(page?.extractionMethod).toBe('body');
    expect(chunks.every((chunk) => chunk.embeddingStatus === 'pending' && chunk.contentRevision === 1)).toBe(true);

    upgraded.close();
    await Dexie.delete(name);
  });

  it('upgrades v3 records with truthful body extraction provenance without resetting indexing', async () => {
    const name = `migration-v3-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(3).stores({
      pages: '++id, &url, savedAt, indexingStatus',
      chunks: '[pageId+position], pageId, embeddingStatus',
    });
    const pages = legacy.table<V3Page, number>('pages');
    const id = await pages.add({
      chunkCount: 1,
      cleanedTextLength: 400,
      contentRevision: 1,
      embeddingModelId: 'Xenova/all-MiniLM-L6-v2',
      embeddingModelRevision: '751bff37182d3f1213fa05d7196b954e230abad9',
      embeddingVersion: 1,
      indexedChunkCount: 1,
      indexingPhase: null,
      indexingStatus: 'indexed',
      savedAt: 1,
      text: 'Legacy content '.repeat(30),
      title: 'Legacy v3 page',
      truncated: false,
      url: 'https://example.com/v3',
    });
    legacy.close();

    const upgraded = new LocalWebMemoryDatabase(name);
    await upgraded.open();
    expect(await upgraded.pages.get(id)).toMatchObject({ extractionMethod: 'body', indexingStatus: 'indexed', contentRevision: 1 });
    upgraded.close();
    await Dexie.delete(name);
  });

  it('persists valid result batches and derives page progress transactionally', async () => {
    const saved = await upsertPage(capture('content '.repeat(500)));
    const claimed = await claimPendingEmbeddings();
    await commitEmbeddingResults(claimed.map((item) => embeddingResult(item.pageId, item.position, item.contentRevision)));

    const page = await db.pages.get(saved.id);
    const chunks = await getPageChunks(saved.id);
    expect(page).toMatchObject({ indexedChunkCount: saved.chunkCount, indexingStatus: 'indexed' });
    expect(chunks.every((chunk) => chunk.embedding instanceof Float32Array && chunk.embeddingDimension === 384)).toBe(true);
  });

  it('rejects stale or deleted late results', async () => {
    const saved = await upsertPage(capture('content '.repeat(500)));
    const claimed = await claimPendingEmbeddings();
    const replacement = await upsertPage(capture('replacement '.repeat(500)));
    await commitEmbeddingResults(claimed.map((item) => embeddingResult(item.pageId, item.position, item.contentRevision)));
    expect((await getPageChunks(replacement.id)).every((chunk) => chunk.embeddingStatus === 'pending')).toBe(true);

    const replacementClaim = await claimPendingEmbeddings();
    await deletePage(saved.id);
    await commitEmbeddingResults(replacementClaim.map((item) => embeddingResult(item.pageId, item.position, item.contentRevision)));
    expect(await db.pages.get(saved.id)).toBeUndefined();
  });

  it('recovers interrupted work and preserves valid embeddings during retry', async () => {
    const saved = await upsertPage(capture('content '.repeat(500)));
    const claimed = await claimPendingEmbeddings();
    await commitEmbeddingResults([embeddingResult(claimed[0].pageId, claimed[0].position, claimed[0].contentRevision)]);
    await recoverInterruptedIndexing();
    await retryPageIndexing(saved.id);

    const chunks = await getPageChunks(saved.id);
    expect(chunks.some((chunk) => chunk.embeddingStatus === 'indexed')).toBe(true);
    expect(chunks.some((chunk) => chunk.embeddingStatus === 'pending')).toBe(true);
  });

  it('returns only valid current indexed chunks for semantic search', async () => {
    const saved = await upsertPage(capture('semantic search content '.repeat(500)));
    while (true) {
      const claimed = await claimPendingEmbeddings();
      if (claimed.length === 0) break;
      await commitEmbeddingResults(claimed.map((item) => embeddingResult(item.pageId, item.position, item.contentRevision)));
    }
    const candidates = await getSemanticSearchCandidates();
    expect(candidates).toHaveLength(saved.chunkCount);
    expect(candidates.every((candidate) => candidate.pageId === saved.id && candidate.embedding instanceof Float32Array)).toBe(true);
    await db.chunks.update([saved.id, 0], { embedding: new Float32Array(384) });
    expect((await getSemanticSearchCandidates()).some((candidate) => candidate.position === 0)).toBe(false);
  });

  it('clears pages and chunks transactionally and leaves late results harmless', async () => {
    const saved = await upsertPage(capture('delete all content '.repeat(300)));
    const claimed = await claimPendingEmbeddings();
    await deleteAllLocalData();
    await commitEmbeddingResults(claimed.map((item) => embeddingResult(item.pageId, item.position, item.contentRevision)));
    expect(await db.pages.count()).toBe(0);
    expect(await db.chunks.count()).toBe(0);
    expect(await retryPageIndexing(saved.id)).toBe(false);
  });

  it('derives durable page and chunk status counts', async () => {
    await upsertPage(capture('summary content '.repeat(100)));
    const summary = await getLocalDataSummary();
    expect(summary.pageCount).toBe(1);
    expect(summary.chunkCount).toBeGreaterThan(0);
    expect(summary.pageStatuses.pending).toBe(1);
    expect(summary.chunkStatuses.pending).toBe(summary.chunkCount);
  });
});

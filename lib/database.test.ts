import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, deletePage, getPageChunks, LocalWebMemoryDatabase, upsertPage } from './database';
import { preparePageForStorage } from './pages';

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
  });
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
  });

  it('preserves the page ID and replaces all chunks when a URL is saved again', async () => {
    const first = await upsertPage(capture('first capture '.repeat(500)));
    const replacement = await upsertPage(capture('Replacement content has enough visible text to be stored.'));

    expect(replacement.id).toBe(first.id);
    expect(replacement.chunkCount).toBe(1);
    const chunks = await getPageChunks(replacement.id);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain('Replacement content');
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

    upgraded.close();
    await Dexie.delete(name);
  });
});

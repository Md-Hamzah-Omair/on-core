import Dexie, { type Table } from 'dexie';
import { chunkText, type StoredTextChunk } from './text-chunking';
import { cleanAndTruncatePageText, validateCleanedText } from './text-cleaning';
import type { PreparedPage, SavedPage } from './pages';

export class LocalWebMemoryDatabase extends Dexie {
  chunks!: Table<StoredTextChunk, [number, number]>;
  pages!: Table<SavedPage, number>;

  constructor(name = 'LocalWebMemoryDatabase') {
    super(name);
    this.version(1).stores({
      pages: '++id, &url, savedAt',
    });
    this.version(2)
      .stores({
        pages: '++id, &url, savedAt',
        chunks: '[pageId+position], pageId',
      })
      .upgrade(async (transaction) => {
        const pages = transaction.table('pages') as Table<SavedPage, number>;
        const chunks = transaction.table('chunks') as Table<StoredTextChunk, [number, number]>;

        await pages.each(async (page) => {
          if (page.id === undefined) return;

          const cleaned = cleanAndTruncatePageText(page.text);
          const textValidation = validateCleanedText(cleaned.text);
          const drafts = textValidation.valid ? chunkText(cleaned.text) : [];
          const migratedPage: SavedPage = {
            ...page,
            text: cleaned.text,
            truncated: page.truncated || cleaned.truncated,
            cleanedTextLength: cleaned.text.length,
            chunkCount: drafts.length,
          };

          await pages.put(migratedPage);
          if (drafts.length > 0) {
            await chunks.bulkPut(drafts.map((chunk) => ({ ...chunk, pageId: page.id! })));
          }
        });
      });
  }
}

export const db = new LocalWebMemoryDatabase();

export async function upsertPage(prepared: PreparedPage): Promise<SavedPage & { id: number }> {
  return db.transaction('rw', db.pages, db.chunks, async () => {
    const existingPage = await db.pages.where('url').equals(prepared.page.url).first();
    const record: SavedPage = {
      ...prepared.page,
      savedAt: Date.now(),
      ...(existingPage?.id === undefined ? {} : { id: existingPage.id }),
    };
    const pageId = await db.pages.put(record);

    await db.chunks.where('pageId').equals(pageId).delete();
    await db.chunks.bulkPut(prepared.chunks.map((chunk) => ({ ...chunk, pageId })));

    return { ...record, id: pageId };
  });
}

export async function getSavedPages(): Promise<SavedPage[]> {
  return db.pages.orderBy('savedAt').reverse().toArray();
}

export async function getPageChunks(pageId: number): Promise<StoredTextChunk[]> {
  return db.chunks.where('pageId').equals(pageId).sortBy('position');
}

export async function deletePage(pageId: number): Promise<void> {
  await db.transaction('rw', db.pages, db.chunks, async () => {
    await db.chunks.where('pageId').equals(pageId).delete();
    await db.pages.delete(pageId);
  });
}

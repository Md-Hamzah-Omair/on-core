import Dexie, { type Table } from 'dexie';
import type { SavedPage } from './pages';

export class LocalWebMemoryDatabase extends Dexie {
  pages!: Table<SavedPage, number>;

  constructor() {
    super('LocalWebMemoryDatabase');
    this.version(1).stores({
      pages: '++id, &url, savedAt',
    });
  }
}

export const db = new LocalWebMemoryDatabase();

export async function upsertPage(pageData: Omit<SavedPage, 'id' | 'savedAt'>): Promise<SavedPage> {
  return db.transaction('rw', db.pages, async () => {
    const existingPage = await db.pages.where('url').equals(pageData.url).first();
    const record: SavedPage = {
      ...pageData,
      savedAt: Date.now(),
      ...(existingPage?.id === undefined ? {} : { id: existingPage.id }),
    };
    const id = await db.pages.put(record);

    return { ...record, id };
  });
}

export async function getSavedPages(): Promise<SavedPage[]> {
  return db.pages.orderBy('savedAt').reverse().toArray();
}

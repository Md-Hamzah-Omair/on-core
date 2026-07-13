import Dexie, { type Table } from 'dexie';
import { CURRENT_EMBEDDING_METADATA, isCurrentEmbeddingMetadata, isValidEmbedding, type EmbeddingErrorCode } from './embeddings';
import type { EmbeddingWorkerResult, EmbeddingWorkItem } from './embedding-messages';
import { derivePageIndexingState, isChunkIndexed, type IndexingPhase } from './indexing';
import { chunkText, type StoredTextChunk } from './text-chunking';
import { cleanAndTruncatePageText, validateCleanedText } from './text-cleaning';
import type { PreparedPage, SavedPage } from './pages';

type PagesTable = Table<SavedPage, number>;
type ChunksTable = Table<StoredTextChunk, [number, number]>;

async function synchronizePageIndexingState(
  pages: PagesTable,
  chunks: ChunksTable,
  pageId: number,
) {
  const page = await pages.get(pageId);
  if (!page) return;

  const pageChunks = await chunks.where('pageId').equals(pageId).toArray();
  const state = derivePageIndexingState(pageChunks, page.contentRevision);
  const failedChunk = pageChunks.find((chunk) => chunk.embeddingStatus === 'failed');
  await pages.update(pageId, {
    ...state,
    indexingError: state.indexingStatus === 'failed' ? failedChunk?.embeddingError ?? 'Indexing did not complete.' : undefined,
  });
}

export class LocalWebMemoryDatabase extends Dexie {
  chunks!: ChunksTable;
  pages!: PagesTable;

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
        const pages = transaction.table('pages') as PagesTable;
        const chunks = transaction.table('chunks') as ChunksTable;

        await pages.each(async (page) => {
          if (page.id === undefined) return;

          const cleaned = cleanAndTruncatePageText(page.text);
          const textValidation = validateCleanedText(cleaned.text);
          const drafts = textValidation.valid ? chunkText(cleaned.text) : [];
          await pages.put({
            ...page,
            text: cleaned.text,
            truncated: page.truncated || cleaned.truncated,
            cleanedTextLength: cleaned.text.length,
            chunkCount: drafts.length,
          });
          if (drafts.length > 0) {
            await chunks.bulkPut(drafts.map((chunk) => ({
              ...chunk,
              contentRevision: 1,
              embeddingStatus: 'pending' as const,
              pageId: page.id!,
            })));
          }
        });
      });
    this.version(3)
      .stores({
        pages: '++id, &url, savedAt, indexingStatus',
        chunks: '[pageId+position], pageId, embeddingStatus',
      })
      .upgrade(async (transaction) => {
        const pages = transaction.table('pages') as PagesTable;
        const chunks = transaction.table('chunks') as ChunksTable;

        await pages.each(async (page) => {
          if (page.id === undefined) return;

          const pageChunks = await chunks.where('pageId').equals(page.id).toArray();
          const hasChunks = pageChunks.length > 0;
          await pages.put({
            ...page,
            contentRevision: 1,
            ...CURRENT_EMBEDDING_METADATA,
            indexedChunkCount: 0,
            indexingError: hasChunks ? undefined : 'No usable chunks are available for embedding.',
            indexingPhase: hasChunks ? 'queued' : null,
            indexingStatus: hasChunks ? 'pending' : 'failed',
          });
          await chunks.bulkPut(pageChunks.map((chunk) => ({
            ...chunk,
            contentRevision: 1,
            embedding: undefined,
            embeddingDimension: undefined,
            embeddingError: undefined,
            embeddingModelId: undefined,
            embeddingModelRevision: undefined,
            embeddingStatus: 'pending',
            embeddingVersion: undefined,
            indexingStartedAt: undefined,
          })));
        });
      });
  }
}

export const db = new LocalWebMemoryDatabase();

export async function upsertPage(prepared: PreparedPage): Promise<SavedPage & { id: number }> {
  return db.transaction('rw', db.pages, db.chunks, async () => {
    const existingPage = await db.pages.where('url').equals(prepared.page.url).first();
    const contentRevision = (existingPage?.contentRevision ?? 0) + 1;
    const hasChunks = prepared.chunks.length > 0;
    const record: SavedPage = {
      ...prepared.page,
      ...CURRENT_EMBEDDING_METADATA,
      contentRevision,
      indexedChunkCount: 0,
      indexingError: hasChunks ? undefined : 'No usable chunks are available for embedding.',
      indexingPhase: hasChunks ? 'queued' : null,
      indexingStatus: hasChunks ? 'pending' : 'failed',
      savedAt: Date.now(),
      ...(existingPage?.id === undefined ? {} : { id: existingPage.id }),
    };
    const pageId = await db.pages.put(record);

    await db.chunks.where('pageId').equals(pageId).delete();
    await db.chunks.bulkPut(prepared.chunks.map((chunk) => ({
      ...chunk,
      contentRevision,
      embeddingStatus: 'pending',
      pageId,
    })));

    return { ...record, id: pageId };
  });
}

export async function getSavedPages(): Promise<SavedPage[]> {
  return db.pages.orderBy('savedAt').reverse().toArray();
}

export async function getPageChunks(pageId: number): Promise<StoredTextChunk[]> {
  return db.chunks.where('pageId').equals(pageId).sortBy('position');
}

export async function hasPendingIndexingWork(): Promise<boolean> {
  return (await db.chunks.where('embeddingStatus').equals('pending').count()) > 0;
}

export async function recoverInterruptedIndexing(): Promise<void> {
  await db.transaction('rw', db.pages, db.chunks, async () => {
    const pageIds = new Set<number>();
    const chunks = await db.chunks.toArray();

    for (const chunk of chunks) {
      const page = await db.pages.get(chunk.pageId);
      if (!page) continue;
      const isCurrent = isChunkIndexed(chunk, page.contentRevision);
      if (chunk.embeddingStatus === 'indexing' || (chunk.embeddingStatus === 'indexed' && !isCurrent)) {
        pageIds.add(chunk.pageId);
        await db.chunks.update([chunk.pageId, chunk.position], {
          embedding: undefined,
          embeddingDimension: undefined,
          embeddingError: undefined,
          embeddingModelId: undefined,
          embeddingModelRevision: undefined,
          embeddingStatus: 'pending',
          embeddingVersion: undefined,
          indexingStartedAt: undefined,
        });
      }
    }

    for (const pageId of pageIds) {
      await synchronizePageIndexingState(db.pages, db.chunks, pageId);
    }
  });
}

export async function claimPendingEmbeddings(limit = 8): Promise<EmbeddingWorkItem[]> {
  return db.transaction('rw', db.pages, db.chunks, async () => {
    const candidates = await db.chunks.where('embeddingStatus').equals('pending').limit(limit).toArray();
    const pageIds = new Set<number>();
    const claimed: EmbeddingWorkItem[] = [];

    for (const chunk of candidates) {
      const page = await db.pages.get(chunk.pageId);
      if (!page || chunk.contentRevision !== page.contentRevision || !isCurrentEmbeddingMetadata(page)) continue;

      pageIds.add(chunk.pageId);
      claimed.push({
        contentRevision: chunk.contentRevision,
        pageId: chunk.pageId,
        position: chunk.position,
        text: chunk.text,
      });
      await db.chunks.update([chunk.pageId, chunk.position], {
        embeddingStatus: 'indexing',
        indexingStartedAt: Date.now(),
      });
    }

    for (const pageId of pageIds) {
      await synchronizePageIndexingState(db.pages, db.chunks, pageId);
    }

    return claimed;
  });
}

export async function setPagesIndexingPhase(pageIds: number[], phase: Exclude<IndexingPhase, 'queued' | null>): Promise<void> {
  await db.transaction('rw', db.pages, async () => {
    for (const pageId of new Set(pageIds)) {
      const page = await db.pages.get(pageId);
      if (page?.indexingStatus === 'indexing') {
        await db.pages.update(pageId, { indexingPhase: phase });
      }
    }
  });
}

export async function commitEmbeddingResults(results: EmbeddingWorkerResult[]): Promise<void> {
  await db.transaction('rw', db.pages, db.chunks, async () => {
    const affectedPages = new Set<number>();

    for (const result of results) {
      const chunk = await db.chunks.get([result.pageId, result.position]);
      const page = await db.pages.get(result.pageId);
      if (
        !chunk
        || !page
        || chunk.embeddingStatus !== 'indexing'
        || chunk.contentRevision !== result.contentRevision
        || page.contentRevision !== result.contentRevision
        || !isCurrentEmbeddingMetadata(page)
      ) {
        continue;
      }

      affectedPages.add(result.pageId);
      if (result.ok && isValidEmbedding(result.embedding)) {
        await db.chunks.update([result.pageId, result.position], {
          ...CURRENT_EMBEDDING_METADATA,
          embedding: result.embedding,
          embeddingError: undefined,
          embeddingStatus: 'indexed',
          indexingStartedAt: undefined,
        });
      } else {
        await db.chunks.update([result.pageId, result.position], {
          embedding: undefined,
          embeddingDimension: undefined,
          embeddingError: result.ok ? 'INVALID_VECTOR' : result.errorCode,
          embeddingModelId: undefined,
          embeddingModelRevision: undefined,
          embeddingStatus: 'failed',
          embeddingVersion: undefined,
          indexingStartedAt: undefined,
        });
      }
    }

    for (const pageId of affectedPages) {
      await synchronizePageIndexingState(db.pages, db.chunks, pageId);
    }
  });
}

export async function markAllPendingEmbeddingsFailed(errorCode: EmbeddingErrorCode): Promise<void> {
  await db.transaction('rw', db.pages, db.chunks, async () => {
    const chunks = await db.chunks.where('embeddingStatus').anyOf('pending', 'indexing').toArray();
    const pageIds = new Set<number>();

    for (const chunk of chunks) {
      pageIds.add(chunk.pageId);
      await db.chunks.update([chunk.pageId, chunk.position], {
        embeddingError: errorCode,
        embeddingStatus: 'failed',
        indexingStartedAt: undefined,
      });
    }

    for (const pageId of pageIds) {
      await synchronizePageIndexingState(db.pages, db.chunks, pageId);
    }
  });
}

export async function markEmbeddingItemsFailed(items: EmbeddingWorkItem[], errorCode: EmbeddingErrorCode): Promise<void> {
  await db.transaction('rw', db.pages, db.chunks, async () => {
    const pageIds = new Set<number>();
    for (const item of items) {
      const chunk = await db.chunks.get([item.pageId, item.position]);
      const page = await db.pages.get(item.pageId);
      if (!chunk || !page || chunk.embeddingStatus !== 'indexing' || chunk.contentRevision !== item.contentRevision || page.contentRevision !== item.contentRevision) continue;
      pageIds.add(item.pageId);
      await db.chunks.update([item.pageId, item.position], {
        embeddingError: errorCode,
        embeddingStatus: 'failed',
        indexingStartedAt: undefined,
      });
    }
    for (const pageId of pageIds) await synchronizePageIndexingState(db.pages, db.chunks, pageId);
  });
}

export async function retryPageIndexing(pageId: number): Promise<void> {
  await db.transaction('rw', db.pages, db.chunks, async () => {
    const page = await db.pages.get(pageId);
    if (!page) return;

    const chunks = await db.chunks.where('pageId').equals(pageId).toArray();
    for (const chunk of chunks) {
      if (isChunkIndexed(chunk, page.contentRevision)) continue;

      await db.chunks.update([chunk.pageId, chunk.position], {
        embedding: undefined,
        embeddingDimension: undefined,
        embeddingError: undefined,
        embeddingModelId: undefined,
        embeddingModelRevision: undefined,
        embeddingStatus: 'pending',
        embeddingVersion: undefined,
        indexingStartedAt: undefined,
      });
    }

    await synchronizePageIndexingState(db.pages, db.chunks, pageId);
  });
}

export async function deletePage(pageId: number): Promise<void> {
  await db.transaction('rw', db.pages, db.chunks, async () => {
    await db.chunks.where('pageId').equals(pageId).delete();
    await db.pages.delete(pageId);
  });
}

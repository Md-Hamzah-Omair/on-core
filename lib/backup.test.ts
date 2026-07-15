import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertBackupFileSize, applyPreparedBackupRestore, createEncryptedDatabaseBackup, prepareEncryptedBackupRestore } from './backup';
import { MAX_BACKUP_FILE_BYTES } from './backup-format';
import { getDatabaseBackupData, LocalWebMemoryDatabase } from './database';
import { preparePageForStorage } from './pages';

const databases: LocalWebMemoryDatabase[] = [];
const password = 'database backup password';

function database() {
  const instance = new LocalWebMemoryDatabase(`backup-test-${crypto.randomUUID()}`);
  databases.push(instance);
  return instance;
}

function prepared(title: string, url: string) {
  return preparePageForStorage({ extractionMethod: 'body', text: `${title} content `.repeat(30), title, truncated: false, url });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(databases.splice(0).map(async (instance) => {
    const name = instance.name;
    instance.close();
    await Dexie.delete(name);
  }));
});

describe('database backup and restore', () => {
  it('exports and full-replaces a different database', async () => {
    const source = database();
    const target = database();
    await source.open();
    await target.open();
    await source.transaction('rw', source.pages, source.chunks, async () => {
      const page = prepared('Source page', 'https://example.com/source');
      const id = await source.pages.add({ ...page.page, chunkCount: page.chunks.length, cleanedTextLength: page.page.text.length, contentRevision: 1, embeddingModelId: 'Xenova/all-MiniLM-L6-v2', embeddingModelRevision: '751bff37182d3f1213fa05d7196b954e230abad9', embeddingVersion: 1, indexedChunkCount: 0, indexingPhase: 'queued', indexingStatus: 'pending', savedAt: 1 });
      await source.chunks.bulkPut(page.chunks.map((item) => ({ ...item, contentRevision: 1, embeddingStatus: 'pending' as const, pageId: id })));
    });
    await target.pages.add({ ...(await source.pages.toArray())[0], id: 99, title: 'Old target', url: 'https://example.com/old' });

    const backup = await createEncryptedDatabaseBackup(password, source);
    const restore = await prepareEncryptedBackupRestore(backup.bytes, password);
    await applyPreparedBackupRestore(restore, target);

    const restored = await getDatabaseBackupData(target);
    expect(restored.pages.map((page) => page.title)).toEqual(['Source page']);
    expect(restored.chunks).toHaveLength(restore.summary.chunkCount);
    expect(restored.pages[0].contentRevision).toBe(restored.chunks[0].contentRevision);
    expect(restored.pages[0].contentRevision).toBeGreaterThan(restore.data.pages[0].contentRevision);
  });

  it('does not modify the database when authentication or validation fails', async () => {
    const source = database();
    await source.open();
    const record = prepared('Existing page', 'https://example.com/existing');
    await source.transaction('rw', source.pages, source.chunks, async () => {
      const id = await source.pages.add({ ...record.page, chunkCount: record.chunks.length, cleanedTextLength: record.page.text.length, contentRevision: 1, embeddingModelId: 'Xenova/all-MiniLM-L6-v2', embeddingModelRevision: '751bff37182d3f1213fa05d7196b954e230abad9', embeddingVersion: 1, indexedChunkCount: 0, indexingPhase: 'queued', indexingStatus: 'pending', savedAt: 1 });
      await source.chunks.bulkPut(record.chunks.map((item) => ({ ...item, contentRevision: 1, embeddingStatus: 'pending' as const, pageId: id })));
    });
    const before = await getDatabaseBackupData(source);
    const backup = await createEncryptedDatabaseBackup(password, source);

    await expect(prepareEncryptedBackupRestore(backup.bytes, 'incorrect password')).rejects.toThrow();
    expect(await getDatabaseBackupData(source)).toEqual(before);
  });

  it('rolls back clears when a replacement write fails', async () => {
    const source = database();
    const target = database();
    await source.open();
    await target.open();
    const sourcePage = prepared('Source', 'https://example.com/source');
    const targetPage = prepared('Target', 'https://example.com/target');
    for (const [instance, value] of [[source, sourcePage], [target, targetPage]] as const) {
      await instance.transaction('rw', instance.pages, instance.chunks, async () => {
        const id = await instance.pages.add({ ...value.page, chunkCount: value.chunks.length, cleanedTextLength: value.page.text.length, contentRevision: 1, embeddingModelId: 'Xenova/all-MiniLM-L6-v2', embeddingModelRevision: '751bff37182d3f1213fa05d7196b954e230abad9', embeddingVersion: 1, indexedChunkCount: 0, indexingPhase: 'queued', indexingStatus: 'pending', savedAt: 1 });
        await instance.chunks.bulkPut(value.chunks.map((item) => ({ ...item, contentRevision: 1, embeddingStatus: 'pending' as const, pageId: id })));
      });
    }
    const preparedRestore = await prepareEncryptedBackupRestore((await createEncryptedDatabaseBackup(password, source)).bytes, password);
    const before = await getDatabaseBackupData(target);
    await target.chunks.toCollection().modify({ embeddingStatus: 'indexing' });
    await expect(applyPreparedBackupRestore(preparedRestore, target)).rejects.toThrow('Wait for active indexing');
    await target.chunks.toCollection().modify({ embeddingStatus: 'pending' });
    vi.spyOn(target.chunks, 'bulkPut').mockRejectedValueOnce(new Error('simulated quota failure'));

    await expect(applyPreparedBackupRestore(preparedRestore, target)).rejects.toThrow('simulated quota failure');
    expect(await getDatabaseBackupData(target)).toEqual(before);
  });

  it('rejects oversized imports before parsing', () => {
    expect(() => assertBackupFileSize(MAX_BACKUP_FILE_BYTES + 1)).toThrow('128 MiB');
  });
});

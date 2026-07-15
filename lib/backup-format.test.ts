import { describe, expect, it } from 'vitest';
import { BACKUP_KDF_ITERATIONS, BackupAuthenticationError } from './backup-crypto';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  createBackupPayload,
  decryptBackupEnvelope,
  deserializeBackupPayload,
  encryptBackupPayload,
  parseBackupEnvelope,
  validateBackupPayload,
  type BackupEnvelope,
} from './backup-format';
import { EMBEDDING_DIMENSION, EMBEDDING_MODEL_ID, EMBEDDING_MODEL_REVISION, EMBEDDING_VERSION } from './embeddings';
import type { SavedPage } from './pages';
import type { StoredTextChunk } from './text-chunking';

const password = 'backup password for tests';
const page: SavedPage = {
  chunkCount: 1,
  cleanedTextLength: 24,
  contentRevision: 1,
  embeddingModelId: EMBEDDING_MODEL_ID,
  embeddingModelRevision: EMBEDDING_MODEL_REVISION,
  embeddingVersion: EMBEDDING_VERSION,
  extractionMethod: 'readability',
  id: 7,
  indexedChunkCount: 1,
  indexingPhase: null,
  indexingStatus: 'indexed',
  savedAt: 1_700_000_000_000,
  text: 'Private fixture content.',
  title: 'Private fixture title',
  truncated: false,
  url: 'https://example.com/private',
};
const embedding = new Float32Array(EMBEDDING_DIMENSION);
embedding[0] = 1;
const chunk: StoredTextChunk = {
  characterCount: page.text.length,
  contentRevision: 1,
  embedding,
  embeddingDimension: EMBEDDING_DIMENSION,
  embeddingModelId: EMBEDDING_MODEL_ID,
  embeddingModelRevision: EMBEDDING_MODEL_REVISION,
  embeddingStatus: 'indexed',
  embeddingVersion: EMBEDDING_VERSION,
  pageId: 7,
  position: 0,
  text: page.text,
};

describe('encrypted backup format', () => {
  it('serializes deterministically and restores typed embeddings', () => {
    const first = createBackupPayload([page], [chunk]);
    const second = createBackupPayload([page], [chunk]);
    const restored = deserializeBackupPayload(first);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(restored.pages).toEqual([page]);
    expect(restored.chunks[0].embedding).toEqual(embedding);
  });

  it('round trips without exposing passwords or page plaintext', async () => {
    const result = await encryptBackupPayload(createBackupPayload([page], [chunk]), password, 1_710_000_000_000);
    const serialized = new TextDecoder().decode(result.bytes);

    expect(result.envelope).toMatchObject({ format: BACKUP_FORMAT, version: BACKUP_VERSION, kdf: { iterations: BACKUP_KDF_ITERATIONS } });
    expect(serialized).not.toContain(password);
    expect(serialized).not.toContain(page.title);
    expect(serialized).not.toContain(page.text);
    await expect(decryptBackupEnvelope(parseBackupEnvelope(serialized), password)).resolves.toEqual(createBackupPayload([page], [chunk]));
  });

  it('uses unique IVs for independent backups', async () => {
    const payload = createBackupPayload([page], [chunk]);
    const [first, second] = await Promise.all([encryptBackupPayload(payload, password), encryptBackupPayload(payload, password)]);

    expect(first.envelope.cipher.iv).not.toBe(second.envelope.cipher.iv);
  });

  it('rejects wrong passwords and tampered ciphertext or authenticated metadata', async () => {
    const { envelope } = await encryptBackupPayload(createBackupPayload([page], [chunk]), password);
    await expect(decryptBackupEnvelope(envelope, 'wrong password value')).rejects.toBeInstanceOf(BackupAuthenticationError);

    const ciphertextTamper: BackupEnvelope = { ...envelope, ciphertext: `${envelope.ciphertext[0] === 'A' ? 'B' : 'A'}${envelope.ciphertext.slice(1)}` };
    await expect(decryptBackupEnvelope(ciphertextTamper, password)).rejects.toBeInstanceOf(BackupAuthenticationError);

    const metadataTamper: BackupEnvelope = { ...envelope, createdAt: envelope.createdAt + 1 };
    await expect(decryptBackupEnvelope(metadataTamper, password)).rejects.toBeInstanceOf(BackupAuthenticationError);
  });

  it('rejects unsupported envelopes and invalid payload records', () => {
    expect(() => parseBackupEnvelope(JSON.stringify({ format: BACKUP_FORMAT, version: 99 }))).toThrow('Invalid backup envelope');
    const payload = createBackupPayload([page], [chunk]);
    const malformed = structuredClone(payload) as unknown as { pages: Array<Record<string, unknown>> };
    malformed.pages[0].cleanedTextLength = Number.NaN;
    expect(() => validateBackupPayload(malformed)).toThrow('Invalid page metadata');

    const dangerous = JSON.parse(JSON.stringify(payload).replace('"id":7', '"__proto__":{},"id":7')) as unknown;
    expect(() => validateBackupPayload(dangerous)).toThrow('Invalid page record');

    const mismatchedModel = structuredClone(payload) as unknown as { chunks: Array<Record<string, unknown>> };
    mismatchedModel.chunks[0].embeddingModelRevision = 'unexpected-revision';
    expect(() => validateBackupPayload(mismatchedModel)).toThrow('invalid model metadata');
  });
});

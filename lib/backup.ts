import type { DatabaseBackupData, LocalWebMemoryDatabase } from './database';
import { db, getDatabaseBackupData, replaceDatabaseFromBackup } from './database';
import {
  MAX_BACKUP_FILE_BYTES,
  createBackupPayload,
  decryptBackupEnvelope,
  deserializeBackupPayload,
  encryptBackupPayload,
  parseBackupEnvelope,
  type BackupEnvelope,
  type BackupPayload,
  type BackupSummary,
} from './backup-format';

export interface PreparedRestore {
  data: DatabaseBackupData;
  payload: BackupPayload;
  summary: Omit<BackupSummary, 'fileSize'>;
}

export function assertBackupFileSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_BACKUP_FILE_BYTES) {
    throw new RangeError('The selected backup exceeds the 128 MiB limit.');
  }
}

export async function createEncryptedDatabaseBackup(password: string, database: LocalWebMemoryDatabase = db) {
  const data = await getDatabaseBackupData(database);
  return encryptBackupPayload(createBackupPayload(data.pages, data.chunks), password);
}

export function parseEncryptedBackupBytes(bytes: Uint8Array): BackupEnvelope {
  assertBackupFileSize(bytes.length);
  let serialized: string;
  try {
    serialized = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new TypeError('The selected file is not a valid On-Core backup.');
  }
  return parseBackupEnvelope(serialized);
}

export async function prepareEncryptedBackupRestore(bytes: Uint8Array, password: string): Promise<PreparedRestore> {
  const envelope = parseEncryptedBackupBytes(bytes);
  const payload = await decryptBackupEnvelope(envelope, password);
  return {
    data: deserializeBackupPayload(payload),
    payload,
    summary: {
      chunkCount: payload.chunks.length,
      createdAt: envelope.createdAt,
      pageCount: payload.pages.length,
    },
  };
}

export async function applyPreparedBackupRestore(prepared: PreparedRestore, database: LocalWebMemoryDatabase = db): Promise<void> {
  await replaceDatabaseFromBackup(prepared.data, database);
}

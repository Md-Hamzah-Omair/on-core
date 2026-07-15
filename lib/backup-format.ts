import { EMBEDDING_DIMENSION, EMBEDDING_MODEL_ID, EMBEDDING_MODEL_REVISION, EMBEDDING_VERSION, isValidEmbedding } from './embeddings';
import { EXTRACTION_METHODS } from './page-extraction';
import { isValidProtocol, MAX_TEXT_LENGTH, MAX_TITLE_LENGTH, MAX_URL_LENGTH, type SavedPage } from './pages';
import { CHUNK_MAX_LENGTH, type StoredTextChunk } from './text-chunking';
import {
  BACKUP_CIPHER_ALGORITHM,
  BACKUP_IV_BYTES,
  BACKUP_KDF_ALGORITHM,
  BACKUP_KDF_HASH,
  BACKUP_KDF_ITERATIONS,
  BACKUP_SALT_BYTES,
  BACKUP_TAG_BITS,
  BackupAuthenticationError,
  decodeBase64Url,
  decryptBackupBytes,
  encodeBase64Url,
  encryptBackupBytes,
  randomBytes,
  validateBackupPassword,
} from './backup-crypto';

export const BACKUP_FORMAT = 'on-core-encrypted-backup' as const;
export const BACKUP_VERSION = 1;
export const BACKUP_PAYLOAD_FORMAT = 'on-core-backup-payload' as const;
export const BACKUP_SCHEMA_VERSION = 4;
export const BACKUP_FILE_EXTENSION = '.oncore';
export const BACKUP_MIME_TYPE = 'application/vnd.on-core.backup+json';
export const BACKUP_FILENAME = `on-core-encrypted-backup${BACKUP_FILE_EXTENSION}`;
export const MAX_BACKUP_FILE_BYTES = 128 * 1024 * 1024;
export const MAX_BACKUP_PAYLOAD_BYTES = 96 * 1024 * 1024;
export const MAX_BACKUP_PAGES = 10_000;
export const MAX_BACKUP_CHUNKS = 100_000;

type BackupPage = {
  id: number;
  url: string;
  title: string;
  text: string;
  savedAt: number;
  truncated: boolean;
  cleanedTextLength: number;
  chunkCount: number;
  contentRevision: number;
  indexedChunkCount: number;
  indexingError: string | null;
  indexingPhase: 'queued' | 'loading-model' | 'embedding' | null;
  indexingStatus: 'pending' | 'indexing' | 'indexed' | 'failed';
  embeddingModelId: string;
  embeddingModelRevision: string;
  embeddingVersion: number;
  extractionMethod: 'readability' | 'article' | 'main' | 'body';
  byline: string | null;
  siteName: string | null;
  excerpt: string | null;
  language: string | null;
};

type BackupChunk = {
  pageId: number;
  position: number;
  text: string;
  characterCount: number;
  contentRevision: number;
  embedding: string | null;
  embeddingDimension: number | null;
  embeddingError: string | null;
  embeddingModelId: string | null;
  embeddingModelRevision: string | null;
  embeddingStatus: 'pending' | 'indexing' | 'indexed' | 'failed';
  embeddingVersion: number | null;
  indexingStartedAt: number | null;
};

export interface BackupPayload {
  format: typeof BACKUP_PAYLOAD_FORMAT;
  version: typeof BACKUP_VERSION;
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  pages: BackupPage[];
  chunks: BackupChunk[];
}

interface BackupHeader {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: number;
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  kdf: {
    algorithm: typeof BACKUP_KDF_ALGORITHM;
    hash: typeof BACKUP_KDF_HASH;
    iterations: typeof BACKUP_KDF_ITERATIONS;
    salt: string;
  };
  cipher: {
    algorithm: typeof BACKUP_CIPHER_ALGORITHM;
    iv: string;
    tagLength: typeof BACKUP_TAG_BITS;
  };
  ciphertextLength: number;
}

export interface BackupEnvelope extends BackupHeader {
  ciphertext: string;
}

export interface BackupSummary {
  chunkCount: number;
  createdAt: number;
  fileSize: number;
  pageCount: number;
}

const PAGE_KEYS = ['id', 'url', 'title', 'text', 'savedAt', 'truncated', 'cleanedTextLength', 'chunkCount', 'contentRevision', 'indexedChunkCount', 'indexingError', 'indexingPhase', 'indexingStatus', 'embeddingModelId', 'embeddingModelRevision', 'embeddingVersion', 'extractionMethod', 'byline', 'siteName', 'excerpt', 'language'] as const;
const CHUNK_KEYS = ['pageId', 'position', 'text', 'characterCount', 'contentRevision', 'embedding', 'embeddingDimension', 'embeddingError', 'embeddingModelId', 'embeddingModelRevision', 'embeddingStatus', 'embeddingVersion', 'indexingStartedAt'] as const;
const STATUS_VALUES = ['pending', 'indexing', 'indexed', 'failed'] as const;
const PHASE_VALUES = ['queued', 'loading-model', 'embedding', null] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isInteger(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

function isNullableString(value: unknown, maximumLength: number): value is string | null {
  return value === null || (typeof value === 'string' && value.length <= maximumLength);
}

function float32ToBase64(vector: Float32Array): string {
  const bytes = new Uint8Array(vector.length * Float32Array.BYTES_PER_ELEMENT);
  const view = new DataView(bytes.buffer);
  vector.forEach((value, index) => view.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, value, true));
  return encodeBase64Url(bytes);
}

function base64ToFloat32(value: string): Float32Array {
  if (value.length > 2048) throw new TypeError('Invalid embedding encoding.');
  const bytes = decodeBase64Url(value, EMBEDDING_DIMENSION * Float32Array.BYTES_PER_ELEMENT);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vector = new Float32Array(EMBEDDING_DIMENSION);
  for (let index = 0; index < vector.length; index += 1) vector[index] = view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true);
  if (!isValidEmbedding(vector)) throw new TypeError('Invalid embedding values.');
  return vector;
}

function serializePage(page: SavedPage): BackupPage {
  if (!isInteger(page.id, 1)) throw new TypeError('A page is missing its identifier.');
  return {
    id: page.id,
    url: page.url,
    title: page.title,
    text: page.text,
    savedAt: page.savedAt,
    truncated: page.truncated,
    cleanedTextLength: page.cleanedTextLength,
    chunkCount: page.chunkCount,
    contentRevision: page.contentRevision,
    indexedChunkCount: page.indexedChunkCount,
    indexingError: page.indexingError ?? null,
    indexingPhase: page.indexingPhase,
    indexingStatus: page.indexingStatus,
    embeddingModelId: page.embeddingModelId,
    embeddingModelRevision: page.embeddingModelRevision,
    embeddingVersion: page.embeddingVersion,
    extractionMethod: page.extractionMethod,
    byline: page.byline ?? null,
    siteName: page.siteName ?? null,
    excerpt: page.excerpt ?? null,
    language: page.language ?? null,
  };
}

function serializeChunk(chunk: StoredTextChunk): BackupChunk {
  if (chunk.embedding !== undefined && !isValidEmbedding(chunk.embedding)) throw new TypeError('A chunk contains an invalid embedding.');
  return {
    pageId: chunk.pageId,
    position: chunk.position,
    text: chunk.text,
    characterCount: chunk.characterCount,
    contentRevision: chunk.contentRevision,
    embedding: chunk.embedding ? float32ToBase64(chunk.embedding) : null,
    embeddingDimension: chunk.embeddingDimension ?? null,
    embeddingError: chunk.embeddingError ?? null,
    embeddingModelId: chunk.embeddingModelId ?? null,
    embeddingModelRevision: chunk.embeddingModelRevision ?? null,
    embeddingStatus: chunk.embeddingStatus,
    embeddingVersion: chunk.embeddingVersion ?? null,
    indexingStartedAt: chunk.indexingStartedAt ?? null,
  };
}

export function createBackupPayload(pages: SavedPage[], chunks: StoredTextChunk[]): BackupPayload {
  const payload: BackupPayload = {
    format: BACKUP_PAYLOAD_FORMAT,
    version: BACKUP_VERSION,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    pages: [...pages].sort((left, right) => (left.id ?? 0) - (right.id ?? 0)).map(serializePage),
    chunks: [...chunks].sort((left, right) => left.pageId - right.pageId || left.position - right.position).map(serializeChunk),
  };
  return validateBackupPayload(payload);
}

function validatePage(value: unknown): BackupPage {
  if (!isRecord(value) || !hasExactKeys(value, PAGE_KEYS)) throw new TypeError('Invalid page record.');
  if (!isInteger(value.id, 1) || typeof value.url !== 'string' || value.url.length > MAX_URL_LENGTH || !isValidProtocol(value.url)) throw new TypeError('Invalid page identity.');
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > MAX_TITLE_LENGTH) throw new TypeError('Invalid page title.');
  if (typeof value.text !== 'string' || !value.text.trim() || value.text.length > MAX_TEXT_LENGTH) throw new TypeError('Invalid page text.');
  if (!isInteger(value.savedAt) || typeof value.truncated !== 'boolean' || !isInteger(value.cleanedTextLength) || value.cleanedTextLength !== value.text.length) throw new TypeError('Invalid page metadata.');
  if (!isInteger(value.chunkCount) || !isInteger(value.contentRevision, 1) || !isInteger(value.indexedChunkCount) || value.indexedChunkCount > value.chunkCount) throw new TypeError('Invalid page counts.');
  if (!isNullableString(value.indexingError, 500) || !PHASE_VALUES.includes(value.indexingPhase as (typeof PHASE_VALUES)[number]) || !STATUS_VALUES.includes(value.indexingStatus as (typeof STATUS_VALUES)[number])) throw new TypeError('Invalid page indexing state.');
  if (value.embeddingModelId !== EMBEDDING_MODEL_ID || value.embeddingModelRevision !== EMBEDDING_MODEL_REVISION || value.embeddingVersion !== EMBEDDING_VERSION) throw new TypeError('Unsupported page model metadata.');
  if (!EXTRACTION_METHODS.includes(value.extractionMethod as (typeof EXTRACTION_METHODS)[number])) throw new TypeError('Invalid extraction method.');
  if (!isNullableString(value.byline, 300) || !isNullableString(value.siteName, 300) || !isNullableString(value.excerpt, 2000) || !isNullableString(value.language, 35)) throw new TypeError('Invalid extraction metadata.');
  return value as unknown as BackupPage;
}

function validateChunk(value: unknown): BackupChunk {
  if (!isRecord(value) || !hasExactKeys(value, CHUNK_KEYS)) throw new TypeError('Invalid chunk record.');
  if (!isInteger(value.pageId, 1) || !isInteger(value.position) || typeof value.text !== 'string' || !value.text.trim() || value.text.length > CHUNK_MAX_LENGTH) throw new TypeError('Invalid chunk content.');
  if (!isInteger(value.characterCount) || value.characterCount !== value.text.length || !isInteger(value.contentRevision, 1)) throw new TypeError('Invalid chunk metadata.');
  if (!STATUS_VALUES.includes(value.embeddingStatus as (typeof STATUS_VALUES)[number])) throw new TypeError('Invalid chunk status.');
  if (!isNullableString(value.embeddingError, 200) || !isNullableString(value.embeddingModelId, 200) || !isNullableString(value.embeddingModelRevision, 200)) throw new TypeError('Invalid chunk model metadata.');
  if (!(value.embeddingDimension === null || value.embeddingDimension === EMBEDDING_DIMENSION) || !(value.embeddingVersion === null || isInteger(value.embeddingVersion, 1)) || !(value.indexingStartedAt === null || isInteger(value.indexingStartedAt))) throw new TypeError('Invalid chunk indexing metadata.');
  if (!(value.embedding === null || typeof value.embedding === 'string')) throw new TypeError('Invalid chunk embedding.');
  if (value.embeddingStatus === 'indexed') {
    if (typeof value.embedding !== 'string' || value.embeddingDimension !== EMBEDDING_DIMENSION || value.embeddingModelId !== EMBEDDING_MODEL_ID || value.embeddingModelRevision !== EMBEDDING_MODEL_REVISION || value.embeddingVersion !== EMBEDDING_VERSION) throw new TypeError('Indexed chunk has invalid model metadata.');
    base64ToFloat32(value.embedding);
  } else if (value.embedding !== null || value.embeddingDimension !== null || value.embeddingModelId !== null || value.embeddingModelRevision !== null || value.embeddingVersion !== null) {
    throw new TypeError('Unindexed chunk contains embedding data.');
  }
  return value as unknown as BackupChunk;
}

export function validateBackupPayload(value: unknown): BackupPayload {
  if (!isRecord(value) || !hasExactKeys(value, ['format', 'version', 'schemaVersion', 'pages', 'chunks'])) throw new TypeError('Invalid backup payload.');
  if (value.format !== BACKUP_PAYLOAD_FORMAT || value.version !== BACKUP_VERSION || value.schemaVersion !== BACKUP_SCHEMA_VERSION) throw new TypeError('Unsupported backup payload.');
  if (!Array.isArray(value.pages) || value.pages.length > MAX_BACKUP_PAGES || !Array.isArray(value.chunks) || value.chunks.length > MAX_BACKUP_CHUNKS) throw new RangeError('Backup record limit exceeded.');
  const pages = value.pages.map(validatePage);
  const chunks = value.chunks.map(validateChunk);
  const pageIds = new Set<number>();
  const urls = new Set<string>();
  for (const page of pages) {
    if (pageIds.has(page.id) || urls.has(page.url)) throw new TypeError('Duplicate page record.');
    pageIds.add(page.id);
    urls.add(page.url);
  }
  const chunkKeys = new Set<string>();
  const chunksByPage = new Map<number, BackupChunk[]>();
  for (const chunk of chunks) {
    if (!pageIds.has(chunk.pageId)) throw new TypeError('Orphaned chunk record.');
    const key = `${chunk.pageId}:${chunk.position}`;
    if (chunkKeys.has(key)) throw new TypeError('Duplicate chunk record.');
    chunkKeys.add(key);
    const pageChunks = chunksByPage.get(chunk.pageId) ?? [];
    pageChunks.push(chunk);
    chunksByPage.set(chunk.pageId, pageChunks);
  }
  for (const page of pages) {
    const pageChunks = (chunksByPage.get(page.id) ?? []).sort((left, right) => left.position - right.position);
    if (pageChunks.length !== page.chunkCount || pageChunks.some((chunk, index) => chunk.position !== index || chunk.contentRevision !== page.contentRevision)) throw new TypeError('Page and chunk records do not agree.');
    if (pageChunks.filter((chunk) => chunk.embeddingStatus === 'indexed').length !== page.indexedChunkCount) throw new TypeError('Indexed chunk count does not agree.');
  }
  return { format: BACKUP_PAYLOAD_FORMAT, version: BACKUP_VERSION, schemaVersion: BACKUP_SCHEMA_VERSION, pages, chunks };
}

function headerBytes(header: BackupHeader): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(header));
}

function parseEnvelope(value: unknown): BackupEnvelope {
  if (!isRecord(value) || !hasExactKeys(value, ['format', 'version', 'createdAt', 'schemaVersion', 'kdf', 'cipher', 'ciphertextLength', 'ciphertext'])) throw new TypeError('Invalid backup envelope.');
  if (value.format !== BACKUP_FORMAT || value.version !== BACKUP_VERSION || value.schemaVersion !== BACKUP_SCHEMA_VERSION) throw new TypeError('Unsupported backup version.');
  if (!isInteger(value.createdAt, 1) || !isInteger(value.ciphertextLength, BACKUP_TAG_BITS / 8) || typeof value.ciphertext !== 'string') throw new TypeError('Invalid backup envelope metadata.');
  if (!isRecord(value.kdf) || !hasExactKeys(value.kdf, ['algorithm', 'hash', 'iterations', 'salt']) || value.kdf.algorithm !== BACKUP_KDF_ALGORITHM || value.kdf.hash !== BACKUP_KDF_HASH || value.kdf.iterations !== BACKUP_KDF_ITERATIONS || typeof value.kdf.salt !== 'string') throw new TypeError('Unsupported backup KDF.');
  if (!isRecord(value.cipher) || !hasExactKeys(value.cipher, ['algorithm', 'iv', 'tagLength']) || value.cipher.algorithm !== BACKUP_CIPHER_ALGORITHM || value.cipher.tagLength !== BACKUP_TAG_BITS || typeof value.cipher.iv !== 'string') throw new TypeError('Unsupported backup cipher.');
  decodeBase64Url(value.kdf.salt, BACKUP_SALT_BYTES);
  decodeBase64Url(value.cipher.iv, BACKUP_IV_BYTES);
  if (value.ciphertext.length > Math.ceil(MAX_BACKUP_FILE_BYTES * 4 / 3)) throw new RangeError('Backup file is too large.');
  const ciphertext = decodeBase64Url(value.ciphertext);
  if (ciphertext.length !== value.ciphertextLength) throw new TypeError('Backup ciphertext length does not agree.');
  return value as unknown as BackupEnvelope;
}

export function parseBackupEnvelope(serialized: string): BackupEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    throw new TypeError('The selected file is not a valid On-Core backup.');
  }
  return parseEnvelope(value);
}

export async function encryptBackupPayload(payloadValue: BackupPayload, password: string, createdAt = Date.now()): Promise<{ bytes: Uint8Array; envelope: BackupEnvelope; summary: BackupSummary }> {
  validateBackupPassword(password);
  const payload = validateBackupPayload(payloadValue);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  if (plaintext.length > MAX_BACKUP_PAYLOAD_BYTES) throw new RangeError('The backup payload is too large.');
  const salt = randomBytes(BACKUP_SALT_BYTES);
  const iv = randomBytes(BACKUP_IV_BYTES);
  const header: BackupHeader = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    kdf: { algorithm: BACKUP_KDF_ALGORITHM, hash: BACKUP_KDF_HASH, iterations: BACKUP_KDF_ITERATIONS, salt: encodeBase64Url(salt) },
    cipher: { algorithm: BACKUP_CIPHER_ALGORITHM, iv: encodeBase64Url(iv), tagLength: BACKUP_TAG_BITS },
    ciphertextLength: plaintext.length + BACKUP_TAG_BITS / 8,
  };
  try {
    const ciphertext = await encryptBackupBytes(plaintext, password, salt, iv, headerBytes(header));
    const envelope: BackupEnvelope = { ...header, ciphertext: encodeBase64Url(ciphertext) };
    const bytes = new TextEncoder().encode(JSON.stringify(envelope));
    if (bytes.length > MAX_BACKUP_FILE_BYTES) throw new RangeError('The encrypted backup is too large.');
    return { bytes, envelope, summary: { chunkCount: payload.chunks.length, createdAt, fileSize: bytes.length, pageCount: payload.pages.length } };
  } finally {
    plaintext.fill(0);
    salt.fill(0);
    iv.fill(0);
  }
}

export async function decryptBackupEnvelope(envelopeValue: BackupEnvelope, password: string): Promise<BackupPayload> {
  const envelope = parseEnvelope(envelopeValue);
  const { ciphertext: encodedCiphertext, ...header } = envelope;
  const salt = decodeBase64Url(header.kdf.salt, BACKUP_SALT_BYTES);
  const iv = decodeBase64Url(header.cipher.iv, BACKUP_IV_BYTES);
  const ciphertext = decodeBase64Url(encodedCiphertext, header.ciphertextLength);
  let plaintext: Uint8Array | undefined;
  try {
    plaintext = await decryptBackupBytes(ciphertext, password, salt, iv, headerBytes(header));
    if (plaintext.length > MAX_BACKUP_PAYLOAD_BYTES) throw new RangeError('The backup payload is too large.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext)) as unknown;
    } catch {
      throw new BackupAuthenticationError();
    }
    return validateBackupPayload(parsed);
  } finally {
    plaintext?.fill(0);
    salt.fill(0);
    iv.fill(0);
    ciphertext.fill(0);
  }
}

export function deserializeBackupPayload(payloadValue: BackupPayload): { pages: SavedPage[]; chunks: StoredTextChunk[] } {
  const payload = validateBackupPayload(payloadValue);
  const pages: SavedPage[] = payload.pages.map((page) => ({
    id: page.id,
    url: page.url,
    title: page.title,
    text: page.text,
    savedAt: page.savedAt,
    truncated: page.truncated,
    cleanedTextLength: page.cleanedTextLength,
    chunkCount: page.chunkCount,
    contentRevision: page.contentRevision,
    indexedChunkCount: page.indexedChunkCount,
    ...(page.indexingError === null ? {} : { indexingError: page.indexingError }),
    indexingPhase: page.indexingPhase,
    indexingStatus: page.indexingStatus,
    embeddingModelId: page.embeddingModelId,
    embeddingModelRevision: page.embeddingModelRevision,
    embeddingVersion: page.embeddingVersion,
    extractionMethod: page.extractionMethod,
    ...(page.byline === null ? {} : { byline: page.byline }),
    ...(page.siteName === null ? {} : { siteName: page.siteName }),
    ...(page.excerpt === null ? {} : { excerpt: page.excerpt }),
    ...(page.language === null ? {} : { language: page.language }),
  }));
  const chunks: StoredTextChunk[] = payload.chunks.map((chunk) => ({
    pageId: chunk.pageId,
    position: chunk.position,
    text: chunk.text,
    characterCount: chunk.characterCount,
    contentRevision: chunk.contentRevision,
    ...(chunk.embedding === null ? {} : { embedding: base64ToFloat32(chunk.embedding) }),
    ...(chunk.embeddingDimension === null ? {} : { embeddingDimension: chunk.embeddingDimension }),
    ...(chunk.embeddingError === null ? {} : { embeddingError: chunk.embeddingError }),
    ...(chunk.embeddingModelId === null ? {} : { embeddingModelId: chunk.embeddingModelId }),
    ...(chunk.embeddingModelRevision === null ? {} : { embeddingModelRevision: chunk.embeddingModelRevision }),
    embeddingStatus: chunk.embeddingStatus,
    ...(chunk.embeddingVersion === null ? {} : { embeddingVersion: chunk.embeddingVersion }),
    ...(chunk.indexingStartedAt === null ? {} : { indexingStartedAt: chunk.indexingStartedAt }),
  }));
  return { pages, chunks };
}

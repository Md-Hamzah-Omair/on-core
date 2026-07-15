export const BACKUP_KDF_ALGORITHM = 'PBKDF2' as const;
export const BACKUP_KDF_HASH = 'SHA-256' as const;
export const BACKUP_KDF_ITERATIONS = 600_000;
export const BACKUP_SALT_BYTES = 32;
export const BACKUP_CIPHER_ALGORITHM = 'AES-256-GCM' as const;
export const BACKUP_IV_BYTES = 12;
export const BACKUP_TAG_BITS = 128;
export const BACKUP_KEY_BITS = 256;
export const MIN_BACKUP_PASSWORD_LENGTH = 12;
export const MAX_BACKUP_PASSWORD_BYTES = 1024;

export class BackupAuthenticationError extends Error {
  constructor() {
    super('The backup could not be decrypted. Check the password and file integrity.');
  }
}

function ownedBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

export function decodeBase64Url(value: string, expectedLength?: number): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/u.test(value)) throw new TypeError('Invalid binary encoding.');
  const paddingLength = (4 - (value.length % 4)) % 4;
  let binary: string;
  try {
    binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat(paddingLength));
  } catch {
    throw new TypeError('Invalid binary encoding.');
  }
  if (expectedLength !== undefined && binary.length !== expectedLength) throw new TypeError('Invalid binary length.');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  if (encodeBase64Url(bytes) !== value) throw new TypeError('Non-canonical binary encoding.');
  return bytes;
}

export function validateBackupPassword(password: string): void {
  const bytes = new TextEncoder().encode(password);
  try {
    if (password.length < MIN_BACKUP_PASSWORD_LENGTH) {
      throw new RangeError(`Backup passwords must contain at least ${MIN_BACKUP_PASSWORD_LENGTH} characters.`);
    }
    if (bytes.length > MAX_BACKUP_PASSWORD_BYTES) throw new RangeError('The backup password is too long.');
  } finally {
    bytes.fill(0);
  }
}

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export async function deriveBackupKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  validateBackupPassword(password);
  if (salt.length !== BACKUP_SALT_BYTES) throw new TypeError('Invalid backup salt.');
  const passwordBytes = new TextEncoder().encode(password);
  try {
    const material = await crypto.subtle.importKey('raw', passwordBytes, BACKUP_KDF_ALGORITHM, false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: BACKUP_KDF_ALGORITHM, hash: BACKUP_KDF_HASH, iterations: BACKUP_KDF_ITERATIONS, salt: ownedBytes(salt) },
      material,
      { name: 'AES-GCM', length: BACKUP_KEY_BITS },
      false,
      ['encrypt', 'decrypt'],
    );
  } finally {
    passwordBytes.fill(0);
  }
}

export async function encryptBackupBytes(
  plaintext: Uint8Array,
  password: string,
  salt: Uint8Array,
  iv: Uint8Array,
  additionalData: Uint8Array,
): Promise<Uint8Array> {
  if (iv.length !== BACKUP_IV_BYTES) throw new TypeError('Invalid backup IV.');
  const key = await deriveBackupKey(password, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ownedBytes(iv), additionalData: ownedBytes(additionalData), tagLength: BACKUP_TAG_BITS },
    key,
    ownedBytes(plaintext),
  );
  return new Uint8Array(encrypted);
}

export async function decryptBackupBytes(
  ciphertext: Uint8Array,
  password: string,
  salt: Uint8Array,
  iv: Uint8Array,
  additionalData: Uint8Array,
): Promise<Uint8Array> {
  try {
    const key = await deriveBackupKey(password, salt);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ownedBytes(iv), additionalData: ownedBytes(additionalData), tagLength: BACKUP_TAG_BITS },
      key,
      ownedBytes(ciphertext),
    );
    return new Uint8Array(decrypted);
  } catch (error) {
    if (error instanceof RangeError) throw error;
    throw new BackupAuthenticationError();
  }
}

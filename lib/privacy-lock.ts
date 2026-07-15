import { decodeBase64Url, encodeBase64Url } from './backup-crypto';

export const PRIVACY_LOCK_FORMAT = 'on-core-local-privacy-lock' as const;
export const PRIVACY_LOCK_VERSION = 1;
export const PRIVACY_LOCK_KDF = 'PBKDF2' as const;
export const PRIVACY_LOCK_HASH = 'SHA-256' as const;
export const PRIVACY_LOCK_ITERATIONS = 600_000;
export const PRIVACY_LOCK_SALT_BYTES = 32;
export const PRIVACY_LOCK_VERIFIER_BYTES = 32;
export const MIN_PRIVACY_LOCK_PASSWORD_LENGTH = 6;
export const MAX_PRIVACY_LOCK_PASSWORD_BYTES = 1024;
export const DEFAULT_AUTO_LOCK_MINUTES = 15;
export const AUTO_LOCK_OPTIONS = [5, 15, 30, 60] as const;

export type AutoLockMinutes = (typeof AUTO_LOCK_OPTIONS)[number];

export interface PrivacyLockConfig {
  format: typeof PRIVACY_LOCK_FORMAT;
  version: typeof PRIVACY_LOCK_VERSION;
  kdf: typeof PRIVACY_LOCK_KDF;
  hash: typeof PRIVACY_LOCK_HASH;
  iterations: typeof PRIVACY_LOCK_ITERATIONS;
  salt: string;
  verifier: string;
  autoLockMinutes: AutoLockMinutes;
}

export interface PrivacyLockSession {
  unlocked: true;
  lastActivityAt: number;
}

function ownedBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

export function isAutoLockMinutes(value: unknown): value is AutoLockMinutes {
  return typeof value === 'number' && AUTO_LOCK_OPTIONS.includes(value as AutoLockMinutes);
}

export function validatePrivacyLockPassword(password: string): void {
  const bytes = new TextEncoder().encode(password);
  try {
    if (password.length < MIN_PRIVACY_LOCK_PASSWORD_LENGTH) {
      throw new RangeError(`PIN or password must contain at least ${MIN_PRIVACY_LOCK_PASSWORD_LENGTH} characters.`);
    }
    if (bytes.length > MAX_PRIVACY_LOCK_PASSWORD_BYTES) throw new RangeError('PIN or password is too long.');
  } finally {
    bytes.fill(0);
  }
}

export function parsePrivacyLockConfig(value: unknown): PrivacyLockConfig | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = ['autoLockMinutes', 'format', 'hash', 'iterations', 'kdf', 'salt', 'verifier', 'version'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return null;
  if (record.format !== PRIVACY_LOCK_FORMAT || record.version !== PRIVACY_LOCK_VERSION || record.kdf !== PRIVACY_LOCK_KDF || record.hash !== PRIVACY_LOCK_HASH || record.iterations !== PRIVACY_LOCK_ITERATIONS || !isAutoLockMinutes(record.autoLockMinutes) || typeof record.salt !== 'string' || typeof record.verifier !== 'string') return null;
  try {
    decodeBase64Url(record.salt, PRIVACY_LOCK_SALT_BYTES);
    decodeBase64Url(record.verifier, PRIVACY_LOCK_VERIFIER_BYTES);
  } catch {
    return null;
  }
  return record as unknown as PrivacyLockConfig;
}

async function deriveVerifier(password: string, salt: Uint8Array): Promise<Uint8Array> {
  validatePrivacyLockPassword(password);
  if (salt.length !== PRIVACY_LOCK_SALT_BYTES) throw new TypeError('Invalid privacy-lock salt.');
  const passwordBytes = new TextEncoder().encode(password);
  try {
    const material = await crypto.subtle.importKey('raw', ownedBytes(passwordBytes), PRIVACY_LOCK_KDF, false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: PRIVACY_LOCK_KDF, hash: PRIVACY_LOCK_HASH, iterations: PRIVACY_LOCK_ITERATIONS, salt: ownedBytes(salt) },
      material,
      PRIVACY_LOCK_VERIFIER_BYTES * 8,
    );
    return new Uint8Array(bits);
  } finally {
    passwordBytes.fill(0);
  }
}

export async function createPrivacyLockConfig(password: string, autoLockMinutes: AutoLockMinutes = DEFAULT_AUTO_LOCK_MINUTES): Promise<PrivacyLockConfig> {
  if (!isAutoLockMinutes(autoLockMinutes)) throw new RangeError('Unsupported auto-lock interval.');
  const salt = crypto.getRandomValues(new Uint8Array(PRIVACY_LOCK_SALT_BYTES));
  try {
    const verifier = await deriveVerifier(password, salt);
    try {
      return {
        format: PRIVACY_LOCK_FORMAT,
        version: PRIVACY_LOCK_VERSION,
        kdf: PRIVACY_LOCK_KDF,
        hash: PRIVACY_LOCK_HASH,
        iterations: PRIVACY_LOCK_ITERATIONS,
        salt: encodeBase64Url(salt),
        verifier: encodeBase64Url(verifier),
        autoLockMinutes,
      };
    } finally {
      verifier.fill(0);
    }
  } finally {
    salt.fill(0);
  }
}

export async function verifyPrivacyLockPassword(password: string, configValue: unknown): Promise<boolean> {
  const config = parsePrivacyLockConfig(configValue);
  if (!config) return false;
  let expected: Uint8Array | undefined;
  let actual: Uint8Array | undefined;
  try {
    expected = decodeBase64Url(config.verifier, PRIVACY_LOCK_VERIFIER_BYTES);
    actual = await deriveVerifier(password, decodeBase64Url(config.salt, PRIVACY_LOCK_SALT_BYTES));
    let difference = 0;
    for (let index = 0; index < expected.length; index += 1) difference |= expected[index] ^ actual[index];
    return difference === 0;
  } catch {
    return false;
  } finally {
    expected?.fill(0);
    actual?.fill(0);
  }
}

export function isPrivacyLockSession(value: unknown): value is PrivacyLockSession {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.unlocked === true && typeof record.lastActivityAt === 'number' && Number.isFinite(record.lastActivityAt) && record.lastActivityAt >= 0;
}

export function isPrivacyLockExpired(session: PrivacyLockSession, autoLockMinutes: AutoLockMinutes, now = Date.now()): boolean {
  return now < session.lastActivityAt || now - session.lastActivityAt >= autoLockMinutes * 60_000;
}

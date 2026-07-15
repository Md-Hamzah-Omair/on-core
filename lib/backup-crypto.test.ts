import { describe, expect, it } from 'vitest';
import {
  BACKUP_IV_BYTES,
  BACKUP_KDF_ITERATIONS,
  BACKUP_SALT_BYTES,
  BackupAuthenticationError,
  decryptBackupBytes,
  deriveBackupKey,
  encryptBackupBytes,
  randomBytes,
  validateBackupPassword,
} from './backup-crypto';

const password = 'correct horse battery staple';

describe('backup cryptography', () => {
  it('uses the approved KDF and derives a non-extractable AES key', async () => {
    const key = await deriveBackupKey(password, new Uint8Array(BACKUP_SALT_BYTES));

    expect(BACKUP_KDF_ITERATIONS).toBe(600_000);
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    expect(key.extractable).toBe(false);
  });

  it('enforces password and parameter lengths', async () => {
    expect(() => validateBackupPassword('too short')).toThrow(/at least 12/u);
    await expect(deriveBackupKey(password, new Uint8Array(BACKUP_SALT_BYTES - 1))).rejects.toThrow('Invalid backup salt');
  });

  it('encrypts and decrypts with authenticated metadata', async () => {
    const salt = randomBytes(BACKUP_SALT_BYTES);
    const iv = randomBytes(BACKUP_IV_BYTES);
    const plaintext = new TextEncoder().encode('private fixture');
    const aad = new TextEncoder().encode('metadata-v1');
    const ciphertext = await encryptBackupBytes(plaintext, password, salt, iv, aad);

    await expect(decryptBackupBytes(ciphertext, password, salt, iv, aad)).resolves.toEqual(plaintext);
    await expect(decryptBackupBytes(ciphertext, 'incorrect password value', salt, iv, aad)).rejects.toBeInstanceOf(BackupAuthenticationError);
    const tampered = ciphertext.slice();
    tampered[0] ^= 1;
    await expect(decryptBackupBytes(tampered, password, salt, iv, aad)).rejects.toBeInstanceOf(BackupAuthenticationError);
    await expect(decryptBackupBytes(ciphertext, password, salt, iv, new TextEncoder().encode('metadata-v2'))).rejects.toBeInstanceOf(BackupAuthenticationError);
  });
});

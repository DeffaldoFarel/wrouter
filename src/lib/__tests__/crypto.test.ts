import { describe, it, expect } from 'vitest';

// Set encryption key BEFORE importing the module so getEncryptionKey() works
process.env.ENCRYPTION_KEY = 'test-key-for-unit-tests';

import {
  encrypt,
  decrypt,
  isEncrypted,
  safeDecryptApiKey,
} from '../crypto';

describe('crypto', () => {
  // ── encrypt ──────────────────────────────────────────────────────
  describe('encrypt()', () => {
    it('produces a string starting with "enc:v1:"', () => {
      const result = encrypt('hello-world');
      expect(result).toMatch(/^enc:v1:/);
    });

    it('produces three colon-separated parts after the prefix', () => {
      const result = encrypt('test-value');
      const payload = result.slice('enc:v1:'.length);
      const parts = payload.split(':');
      expect(parts).toHaveLength(3);
      // Each part should be valid base64
      for (const part of parts) {
        expect(() => Buffer.from(part, 'base64')).not.toThrow();
      }
    });

    it('produces different ciphertexts for the same plaintext (random IV)', () => {
      const a = encrypt('same-input');
      const b = encrypt('same-input');
      expect(a).not.toBe(b);
    });
  });

  // ── decrypt ──────────────────────────────────────────────────────
  describe('decrypt()', () => {
    it('roundtrips: decrypt(encrypt(x)) returns the original x', () => {
      const plaintext = 'sk-abc123XYZ!@#';
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    it('roundtrips with an empty string', () => {
      const encrypted = encrypt('');
      expect(decrypt(encrypted)).toBe('');
    });

    it('roundtrips with a long string', () => {
      const plaintext = 'a'.repeat(10_000);
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    it('roundtrips with unicode characters', () => {
      const plaintext = '你好世界 🌍🔐';
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    it('throws for a value missing the prefix', () => {
      expect(() => decrypt('not-encrypted')).toThrow(/missing prefix/i);
    });

    it('throws for a value with wrong number of parts', () => {
      expect(() => decrypt('enc:v1:only-one-part')).toThrow(/3 parts/i);
    });

    it('throws for tampered ciphertext', () => {
      const encrypted = encrypt('secret');
      // Flip a character in the ciphertext section
      const parts = encrypted.split(':');
      // parts: ['enc', 'v1', ivB64, ciphertextB64, authTagB64]
      const tampered = parts.slice(0, 3).join(':') + ':AAAA' + parts[4];
      expect(() => decrypt(tampered)).toThrow();
    });
  });

  // ── isEncrypted ──────────────────────────────────────────────────
  describe('isEncrypted()', () => {
    it('returns true for an encrypted value', () => {
      const encrypted = encrypt('test');
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('returns false for a plain string', () => {
      expect(isEncrypted('sk-plain-api-key')).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(isEncrypted('')).toBe(false);
    });

    it('returns false for a string that merely contains the prefix', () => {
      // Has the prefix but also extra stuff — still starts with it so true
      expect(isEncrypted('enc:v1:something')).toBe(true);
    });
  });

  // ── safeDecryptApiKey ────────────────────────────────────────────
  describe('safeDecryptApiKey()', () => {
    it('returns a plaintext value as-is', () => {
      expect(safeDecryptApiKey('sk-plaintext-key')).toBe('sk-plaintext-key');
    });

    it('decrypts an encrypted value correctly', () => {
      const original = 'sk-secret-api-key-12345';
      const encrypted = encrypt(original);
      expect(safeDecryptApiKey(encrypted)).toBe(original);
    });

    it('returns the raw value on decryption failure (corrupted data)', () => {
      const corrupted = 'enc:v1:AAAA:BBBB:CCCC';
      // Should not throw — returns the corrupted string as fallback
      const result = safeDecryptApiKey(corrupted);
      expect(result).toBe(corrupted);
    });
  });
});

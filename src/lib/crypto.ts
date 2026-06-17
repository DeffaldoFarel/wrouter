import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const PREFIX = "enc:v1:";

/**
 * Derive a 32-byte encryption key from environment variables.
 * Priority: ENCRYPTION_KEY (direct or derived) > JWT_SECRET (derived via scrypt)
 */
function getEncryptionKey(): Buffer {
  const directKey = process.env.ENCRYPTION_KEY;
  if (directKey) {
    // If it's a 64-char hex string (32 bytes), use directly as raw key
    if (/^[0-9a-f]{64}$/i.test(directKey)) {
      return Buffer.from(directKey, "hex");
    }
    // Otherwise derive a 32-byte key from the passphrase
    return crypto.scryptSync(directKey, "wrouter-enc-salt-v1", 32);
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret) {
    return crypto.scryptSync(jwtSecret, "wrouter-jwt-salt-v1", 32);
  }

  throw new Error(
    "ENCRYPTION_KEY or JWT_SECRET environment variable must be set for API key encryption"
  );
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns format: enc:v1:<base64-iv>:<base64-ciphertext>:<base64-authTag>
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString("base64")}:${encrypted.toString("base64")}:${authTag.toString("base64")}`;
}

/**
 * Decrypt an encoded string produced by encrypt().
 * Expects format: enc:v1:<base64-iv>:<base64-ciphertext>:<base64-authTag>
 */
export function decrypt(encoded: string): string {
  if (!encoded.startsWith(PREFIX)) {
    throw new Error("Invalid encrypted format: missing prefix");
  }

  const payload = encoded.slice(PREFIX.length);
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format: expected 3 parts");
  }

  const [ivB64, ciphertextB64, authTagB64] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf8");
}

/**
 * Check if a value is in the encrypted format.
 */
export function isEncrypted(value: string): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/**
 * Safely decrypt an API key with backward compatibility for plaintext keys.
 * - If the value is encrypted, decrypts and returns the plaintext.
 * - If the value is plaintext (legacy), returns it as-is.
 * - If decryption fails (corrupted data), logs error and returns the raw value.
 */
export function safeDecryptApiKey(value: string): string {
  if (isEncrypted(value)) {
    try {
      return decrypt(value);
    } catch (err) {
      console.error(
        "Failed to decrypt API key — possible data corruption:",
        err instanceof Error ? err.message : err
      );
      return value;
    }
  }
  return value;
}

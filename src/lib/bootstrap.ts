/**
 * Bootstrap secrets on first boot.
 *
 * Generates random secrets if not already set in environment.
 * Secrets are persisted to DATA_DIR/.secrets so they survive restarts.
 *
 * IMPORTANT: ENCRYPTION_KEY is separate from JWT_SECRET so JWT can be rotated
 * without losing access to encrypted API keys in the database.
 */

import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const SECRETS_FILE = path.join(DATA_DIR, ".secrets");

interface Secrets {
  jwtSecret?: string;
  encryptionKey?: string;
}

function loadSecrets(): Secrets {
  try {
    if (fs.existsSync(SECRETS_FILE)) {
      return JSON.parse(fs.readFileSync(SECRETS_FILE, "utf-8"));
    }
  } catch {
    /* corrupted file, generate new */
  }
  return {};
}

function saveSecrets(secrets: Secrets) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    // K8: mode 0o600 only enforced on POSIX (Linux/macOS).
    // On Windows/NTFS this is ignored — the file inherits parent dir ACLs.
    // For production on Windows: ensure DATA_DIR has restricted ACL (only app user can read).
    // See README "Production Deployment" → Windows section.
    fs.writeFileSync(SECRETS_FILE, JSON.stringify(secrets, null, 2), {
      mode: 0o600,
    });
  } catch {
    console.error("[bootstrap] Failed to persist secrets to", SECRETS_FILE);
  }
}

function generateRandomSecret(length = 48): string {
  return crypto.randomBytes(length).toString("hex");
}

export function bootstrapSecrets() {
  const secrets = loadSecrets();
  let mutated = false;

  // ─── JWT_SECRET (used for session tokens only) ───
  if (!process.env.JWT_SECRET) {
    if (secrets.jwtSecret) {
      process.env.JWT_SECRET = secrets.jwtSecret;
    } else {
      const newSecret = generateRandomSecret();
      process.env.JWT_SECRET = newSecret;
      secrets.jwtSecret = newSecret;
      mutated = true;
      console.log("[bootstrap] Generated random JWT_SECRET (saved to data/.secrets)");
    }
  }

  // ─── ENCRYPTION_KEY (used for API key encryption — independent of JWT) ───
  // Migration: if encryptionKey doesn't exist but jwtSecret does, derive it from jwtSecret
  // to preserve backward compatibility with existing encrypted data.
  if (!process.env.ENCRYPTION_KEY) {
    if (secrets.encryptionKey) {
      process.env.ENCRYPTION_KEY = secrets.encryptionKey;
    } else if (secrets.jwtSecret) {
      // Backward compat: existing installs used JWT_SECRET for encryption.
      // Pin encryptionKey to current jwtSecret so existing data stays decryptable.
      process.env.ENCRYPTION_KEY = secrets.jwtSecret;
      secrets.encryptionKey = secrets.jwtSecret;
      mutated = true;
      console.log("[bootstrap] Pinned ENCRYPTION_KEY to existing JWT_SECRET (backward compat — JWT can now rotate independently)");
    } else {
      const newKey = generateRandomSecret();
      process.env.ENCRYPTION_KEY = newKey;
      secrets.encryptionKey = newKey;
      mutated = true;
      console.log("[bootstrap] Generated random ENCRYPTION_KEY (saved to data/.secrets)");
    }
  }

  if (mutated) {
    saveSecrets(secrets);
  }
}

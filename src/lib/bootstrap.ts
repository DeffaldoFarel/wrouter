/**
 * Bootstrap secrets on first boot.
 *
 * Generates random secrets if not already set in environment.
 * Secrets are persisted to DATA_DIR/.secrets so they survive restarts.
 */

import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const SECRETS_FILE = path.join(DATA_DIR, ".secrets");

interface Secrets {
  jwtSecret?: string;
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

  if (!process.env.JWT_SECRET) {
    if (secrets.jwtSecret) {
      process.env.JWT_SECRET = secrets.jwtSecret;
    } else {
      const newSecret = generateRandomSecret();
      process.env.JWT_SECRET = newSecret;
      secrets.jwtSecret = newSecret;
      console.log("[bootstrap] Generated random JWT_SECRET (saved to data/.secrets)");
    }
  }

  saveSecrets(secrets);
}

/**
 * WRouter Database Backup Script (Cross-platform Node.js)
 * Usage: node scripts/backup.js
 *
 * - Copies data/wrouter.db → data/backups/wrouter-YYYY-MM-DD-HHMMSS.db
 * - Keeps only the last 7 backups
 * - Works on Windows, macOS, and Linux
 */

const fs = require("fs");
const path = require("path");

// ── Configuration ────────────────────────────────────────────
const MAX_BACKUPS = 7;
const PROJECT_DIR = path.resolve(__dirname, "..");
const DB_PATH = path.join(PROJECT_DIR, "data", "wrouter.db");
const BACKUP_DIR = path.join(PROJECT_DIR, "data", "backups");

// ── Helpers ──────────────────────────────────────────────────
function timestamp() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function log(msg) {
  console.log(`[${timestamp()}] ${msg}`);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTimestamp() {
  const d = new Date();
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// ── Pre-flight checks ───────────────────────────────────────
if (!fs.existsSync(DB_PATH)) {
  log(`ERROR: Database not found at ${DB_PATH}`);
  process.exit(1);
}

// ── Create backups directory if needed ──────────────────────
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  log(`Created backup directory: ${BACKUP_DIR}`);
}

// ── Copy the database ───────────────────────────────────────
const backupFile = `wrouter-${fileTimestamp()}.db`;
const backupPath = path.join(BACKUP_DIR, backupFile);

try {
  fs.copyFileSync(DB_PATH, backupPath);
  const stats = fs.statSync(backupPath);
  log(`SUCCESS: Backup created → ${path.join("data", "backups", backupFile)} (${formatBytes(stats.size)})`);
} catch (err) {
  log(`ERROR: Backup failed! ${err.message}`);
  process.exit(1);
}

// ── Prune old backups (keep only the last MAX_BACKUPS) ──────
try {
  const backups = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => /^wrouter-\d{4}-\d{2}-\d{2}-\d{6}\.db$/.test(f))
    .sort(); // Lexicographic sort works because of the timestamp format

  if (backups.length > MAX_BACKUPS) {
    const toRemove = backups.slice(0, backups.length - MAX_BACKUPS);
    log(`Pruning ${toRemove.length} old backup(s) (keeping last ${MAX_BACKUPS})...`);

    for (const old of toRemove) {
      const oldPath = path.join(BACKUP_DIR, old);
      fs.unlinkSync(oldPath);
      log(`  Deleted: ${old}`);
    }
  }

  const remaining = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => /^wrouter-\d{4}-\d{2}-\d{2}-\d{6}\.db$/.test(f));

  log(`Backup complete. Total backups: ${remaining.length}`);
} catch (err) {
  log(`WARNING: Error during pruning: ${err.message}`);
}

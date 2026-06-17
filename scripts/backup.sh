#!/usr/bin/env bash
# ============================================================
# WRouter Database Backup Script (Linux/macOS)
# Usage: ./scripts/backup.sh
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DB_PATH="$PROJECT_DIR/data/wrouter.db"
BACKUP_DIR="$PROJECT_DIR/data/backups"
TIMESTAMP="$(date +"%Y-%m-%d-%H%M%S")"
BACKUP_FILE="wrouter-${TIMESTAMP}.db"
MAX_BACKUPS=7

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# ── Pre-flight checks ──────────────────────────────────────
if [ ! -f "$DB_PATH" ]; then
  log "ERROR: Database not found at $DB_PATH"
  exit 1
fi

# ── Create backups directory if needed ─────────────────────
if [ ! -d "$BACKUP_DIR" ]; then
  mkdir -p "$BACKUP_DIR"
  log "Created backup directory: $BACKUP_DIR"
fi

# ── Copy the database ──────────────────────────────────────
if cp "$DB_PATH" "$BACKUP_DIR/$BACKUP_FILE"; then
  FILESIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)
  log "SUCCESS: Backup created → $BACKUP_DIR/$BACKUP_FILE ($FILESIZE)"
else
  log "ERROR: Backup failed!"
  exit 1
fi

# ── Prune old backups (keep only the last MAX_BACKUPS) ─────
BACKUP_COUNT=$(find "$BACKUP_DIR" -maxdepth 1 -name 'wrouter-*.db' -type f | wc -l)

if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
  REMOVE_COUNT=$((BACKUP_COUNT - MAX_BACKUPS))
  log "Pruning $REMOVE_COUNT old backup(s) (keeping last $MAX_BACKUPS)..."

  # Sort by name (timestamps sort lexically), oldest first
  find "$BACKUP_DIR" -maxdepth 1 -name 'wrouter-*.db' -type f | sort | head -n "$REMOVE_COUNT" | while read -r old_backup; do
    rm -f "$old_backup"
    log "  Deleted: $(basename "$old_backup")"
  done
fi

log "Backup complete. Total backups: $(find "$BACKUP_DIR" -maxdepth 1 -name 'wrouter-*.db' -type f | wc -l)"

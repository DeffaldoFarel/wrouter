import { db } from "@/lib/db";
import { requestLogs, settings } from "@/lib/db/schema";
import { lt, eq, count } from "drizzle-orm";

/**
 * Delete request logs older than the configured retention period.
 * Returns the number of deleted rows. Never throws.
 */
export function cleanupOldLogs(): number {
  try {
    // Read retention period from settings (default 30 days)
    const row = db
      .select()
      .from(settings)
      .where(eq(settings.key, "log_retention_days"))
      .get();

    const retentionDays = row ? parseInt(row.value, 10) || 30 : 30;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoff = cutoffDate.toISOString();

    // Count rows to be deleted
    const [{ value }] = db
      .select({ value: count() })
      .from(requestLogs)
      .where(lt(requestLogs.timestamp, cutoff))
      .all();

    const toDelete = value ?? 0;
    if (toDelete === 0) return 0;

    db.delete(requestLogs)
      .where(lt(requestLogs.timestamp, cutoff))
      .run();

    console.log(`[log-retention] Cleaned up ${toDelete} old log(s) (>${retentionDays}d)`);
    return toDelete;
  } catch (err) {
    console.error("[log-retention] Cleanup failed:", err);
    return 0;
  }
}

/**
 * 1% chance to trigger log cleanup — call on every request (fire-and-forget).
 */
export function maybeCleanupLogs(): void {
  if (Math.random() < 0.01) {
    cleanupOldLogs();
  }
}

import { NextRequest, NextResponse } from "next/server";
import { checkDashboardAuth } from "@/lib/auth/session";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export async function GET(req: NextRequest) {
  if (!checkDashboardAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbPath = path.join(process.cwd(), "data", "wrouter.db");

  if (!fs.existsSync(dbPath)) {
    return NextResponse.json({ error: "Database not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const slim = url.searchParams.get("slim") === "true";
  // J7: Unique temp filename to avoid concurrent-backup clobber on Windows
  const tempPath = path.join(process.cwd(), "data", `wrouter-backup-${randomUUID()}.db`);

  try {
    const Database = (await import("better-sqlite3")).default;

    if (slim) {
      // J6: Slim backup — exclude request_logs (usually 90%+ of DB size).
      //
      // Old approach was: source.backup() → DELETE FROM request_logs → VACUUM.
      // VACUUM blocks the Node event loop for 30-120s on a 1.2GB DB, freezing
      // the entire HTTP server while the backup runs.
      //
      // New approach: ATTACH source + INSERT INTO SELECT into a fresh empty DB.
      // Since the new file starts empty and we skip request_logs entirely, the
      // resulting DB is already minimal — no VACUUM needed. Total work is only
      // proportional to the data we *keep* (settings, providers, keys, etc.),
      // not the full 1.2GB.
      //
      // This still does CPU work synchronously inside better-sqlite3 (it's a
      // C addon, not async I/O), but the work scales with the small kept-data
      // set, not the full DB — typically <1s instead of 30-120s.
      const temp = new Database(tempPath);
      try {
        // Speed: temp is a throwaway file we'll stream out and delete. Skip
        // journaling and fsync entirely — durability doesn't matter here.
        temp.pragma("journal_mode = OFF");
        temp.pragma("synchronous = OFF");

        // ATTACH the source DB. We never write to it (only INSERT ... FROM src),
        // and the main app uses WAL mode so concurrent readers don't block writers.
        // SQLite ATTACH doesn't accept bind parameters — escape single quotes in path.
        const escapedSourcePath = dbPath.replace(/'/g, "''");
        temp.exec(`ATTACH DATABASE '${escapedSourcePath}' AS src`);

        // Enumerate schema objects actually present in source. We can't rely on
        // schema.ts alone because index.ts adds tables/indexes via runtime
        // migrations that may or may not have run on this particular DB.
        //
        // Filters:
        //   sql IS NOT NULL          → skip auto-indexes (sqlite_autoindex_*)
        //   tbl_name != 'request_logs' → drop the big table AND its indexes/triggers
        //   name NOT LIKE 'sqlite_%' → skip internal SQLite metadata
        const objects = temp.prepare(
          `SELECT type, name, tbl_name, sql FROM src.sqlite_master
           WHERE sql IS NOT NULL
             AND tbl_name != 'request_logs'
             AND name NOT LIKE 'sqlite_%'`
        ).all() as Array<{ type: string; name: string; tbl_name: string; sql: string }>;

        const tables = objects.filter((o) => o.type === "table");
        const nonTables = objects.filter((o) => o.type !== "table"); // index, trigger, view

        // Single transaction for DDL + bulk inserts: turns N fsyncs into ~0
        // (we already disabled journaling, but keeping the txn is still faster
        // because SQLite batches page writes in memory).
        temp.exec("BEGIN");
        try {
          // 1. Recreate every table in the new DB. The CREATE TABLE statements
          //    we read from sqlite_master have no schema prefix, so they target
          //    `main` (the temp DB) by default — exactly what we want.
          for (const t of tables) {
            temp.exec(t.sql);
          }

          // 2. Copy data. INSERT INTO main.<t> SELECT * FROM src.<t> works
          //    because the schemas are identical (we just CREATE'd from the
          //    same DDL). request_logs is absent from `tables`, so it's skipped.
          for (const t of tables) {
            const q = t.name.replace(/"/g, '""'); // quote-safe identifier
            temp.exec(`INSERT INTO main."${q}" SELECT * FROM src."${q}"`);
          }

          // 3. Recreate indexes/triggers/views AFTER bulk load — much faster
          //    than maintaining indexes during inserts.
          for (const o of nonTables) {
            try {
              temp.exec(o.sql);
            } catch {
              // An index/trigger may fail if its parent constraint already
              // implicitly created it (e.g. UNIQUE on a column). Safe to skip.
            }
          }

          temp.exec("COMMIT");
        } catch (e) {
          try { temp.exec("ROLLBACK"); } catch { /* ignore */ }
          throw e;
        }

        temp.exec("DETACH DATABASE src");
      } finally {
        temp.close();
      }
    } else {
      // Full backup — better-sqlite3's online backup API copies pages
      // incrementally and yields between batches, so it's safe to use here.
      const source = new Database(dbPath, { readonly: true });
      try {
        await source.backup(tempPath);
      } finally {
        source.close();
      }
    }

    const now = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fileName = slim ? `wrouter-slim-backup-${now}.db` : `wrouter-backup-${now}.db`;
    const stats = fs.statSync(tempPath);

    // Stream file instead of loading into memory (handles large files)
    const stream = fs.createReadStream(tempPath);

    // J7: Unlink temp file AFTER stream finishes reading (Windows fails on sync unlink while reading)
    stream.on("close", () => {
      if (fs.existsSync(tempPath)) {
        fs.unlink(tempPath, () => { /* best-effort cleanup */ });
      }
    });
    stream.on("error", () => {
      if (fs.existsSync(tempPath)) {
        fs.unlink(tempPath, () => { /* best-effort cleanup */ });
      }
    });

    return new Response(stream as any, {
      headers: {
        "Content-Type": "application/x-sqlite3",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": stats.size.toString(),
      },
    });
  } catch (err) {
    console.error("Backup error:", err);
    // Clean up temp file on error path (stream never opened)
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
    }
    return NextResponse.json(
      { error: "Failed to create backup" },
      { status: 500 }
    );
  }
}

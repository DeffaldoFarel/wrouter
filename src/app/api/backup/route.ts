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
      // Slim backup — exclude request_logs (usually 90%+ of DB size).
      //
      // FIX: Previously used ATTACH + INSERT INTO SELECT with schema from
      // sqlite_master. This was BROKEN because ALTER TABLE ADD COLUMN (runtime
      // migrations in index.ts) doesn't update sqlite_master — only the table
      // itself. The backup recreated tables with OLD schemas (missing columns
      // like prefix, connection_strategy, allowed_models, etc.), causing crashes
      // after restore.
      //
      // New approach: source.backup() copies pages 1:1 (100% schema-correct),
      // then we DELETE request_logs from the temp copy. No VACUUM needed —
      // the DELETE is fast and the file remains a valid SQLite database.
      const source = new Database(dbPath, { readonly: true });
      try {
        await source.backup(tempPath);
      } finally {
        source.close();
      }

      // Delete request_logs from the copy (makes it "slim")
      const temp = new Database(tempPath);
      try {
        temp.exec("DELETE FROM request_logs");
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

import { NextRequest, NextResponse } from "next/server";
import { checkDashboardAuth } from "@/lib/auth/session";
import path from "path";
import fs from "fs";

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
  const tempPath = path.join(process.cwd(), "data", "wrouter-backup-temp.db");

  try {
    const Database = (await import("better-sqlite3")).default;
    const source = new Database(dbPath, { readonly: true });

    if (slim) {
      // Slim backup: exclude request_logs (usually 90%+ of DB size)
      await source.backup(tempPath);
      source.close();

      const temp = new Database(tempPath);
      temp.exec("DELETE FROM request_logs; VACUUM;");
      temp.close();
    } else {
      // Full backup
      await source.backup(tempPath);
      source.close();
    }

    const now = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fileName = slim ? `wrouter-slim-backup-${now}.db` : `wrouter-backup-${now}.db`;
    const stats = fs.statSync(tempPath);

    // Stream file instead of loading into memory (handles large files)
    const stream = fs.createReadStream(tempPath);

    return new Response(stream as any, {
      headers: {
        "Content-Type": "application/x-sqlite3",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": stats.size.toString(),
      },
    });
  } catch (err) {
    console.error("Backup error:", err);
    return NextResponse.json(
      { error: "Failed to create backup" },
      { status: 500 }
    );
  } finally {
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
    }
  }
}

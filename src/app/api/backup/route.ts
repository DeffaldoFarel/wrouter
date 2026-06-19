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

  const tempPath = path.join(process.cwd(), "data", "wrouter-backup-temp.db");

  try {
    // Use better-sqlite3 backup API for consistent snapshot
    const Database = (await import("better-sqlite3")).default;
    const source = new Database(dbPath, { readonly: true });
    await source.backup(tempPath);
    source.close();

    const buffer = fs.readFileSync(tempPath);
    const now = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/x-sqlite3",
        "Content-Disposition": `attachment; filename="wrouter-backup-${now}.db"`,
        "Content-Length": buffer.length.toString(),
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

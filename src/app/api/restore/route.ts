import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import path from "path";
import fs from "fs";

function checkAuth(req: NextRequest): boolean {
  const token = req.cookies.get("session_token")?.value;
  return !!token && verifySession(token);
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("database") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Validate file extension
    if (!file.name.endsWith(".db")) {
      return NextResponse.json({ error: "File must be a .db file" }, { status: 400 });
    }

    // Validate file size (max 100MB)
    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 100MB)" }, { status: 400 });
    }

    // Read uploaded file into buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate SQLite magic bytes: "SQLite format 3\0"
    const header = buffer.subarray(0, 16).toString("ascii");
    if (!header.startsWith("SQLite format 3")) {
      return NextResponse.json({ error: "Invalid SQLite database file" }, { status: 400 });
    }

    const dataDir = path.join(process.cwd(), "data");
    const dbPath = path.join(dataDir, "wrouter.db");
    const tempPath = path.join(dataDir, "wrouter-restore-temp.db");

    try {
      // Write uploaded file to temp location
      fs.writeFileSync(tempPath, buffer);

      // Use better-sqlite3 backup API to safely restore
      const Database = (await import("better-sqlite3")).default;
      const source = new Database(tempPath, { readonly: true });

      // Backup from uploaded file → live database
      await source.backup(dbPath);
      source.close();

      return NextResponse.json({
        success: true,
        message: "Database restored successfully. Please refresh the page to see updated data.",
      });
    } finally {
      // Clean up temp file
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
      }
    }
  } catch (err) {
    console.error("Restore error:", err);
    return NextResponse.json(
      { error: "Failed to restore database: " + (err instanceof Error ? err.message : "Unknown error") },
      { status: 500 }
    );
  }
}

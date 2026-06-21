import { NextRequest, NextResponse } from "next/server";
import { checkDashboardAuth } from "@/lib/auth/session";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { invalidateProviderCache } from "@/lib/router/engine";
import { notifySubscribers } from "@/app/api/events/route";

// Allow restore of large production DBs (default 2GB cap)
const MAX_RESTORE_SIZE = 2 * 1024 * 1024 * 1024;

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

export async function POST(req: NextRequest) {
  if (!checkDashboardAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dataDir = path.join(process.cwd(), "data");
  const dbPath = path.join(dataDir, "wrouter.db");
  // Unique temp filename to avoid concurrent-restore clobber
  const tempPath = path.join(dataDir, `wrouter-restore-${randomUUID()}.db`);

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

    // Validate file size (raised to 2GB to support production restores)
    if (file.size > MAX_RESTORE_SIZE) {
      return NextResponse.json(
        { error: `File too large (max ${(MAX_RESTORE_SIZE / 1024 / 1024 / 1024).toFixed(1)}GB)` },
        { status: 400 }
      );
    }

    // Stream upload to disk instead of buffering entire file in RAM.
    // For a 1.2GB DB this avoids ~3GB peak memory (file + Buffer + ArrayBuffer).
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const writeStream = fs.createWriteStream(tempPath);
    const reader = file.stream().getReader();
    let bytesWritten = 0;
    let headerValidated = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        // Validate SQLite magic bytes on first chunk to fail fast
        if (!headerValidated && value.length >= 16) {
          const header = Buffer.from(value.slice(0, 16)).toString("ascii");
          if (!header.startsWith("SQLite format 3")) {
            writeStream.destroy();
            return NextResponse.json(
              { error: "Invalid SQLite database file" },
              { status: 400 }
            );
          }
          headerValidated = true;
        }

        // Write chunk to disk
        await new Promise<void>((resolve, reject) => {
          writeStream.write(value, (err) => (err ? reject(err) : resolve()));
        });
        bytesWritten += value.length;

        if (bytesWritten > MAX_RESTORE_SIZE) {
          writeStream.destroy();
          return NextResponse.json(
            { error: "File exceeded size limit during upload" },
            { status: 400 }
          );
        }
      }
      await new Promise<void>((resolve, reject) => {
        writeStream.end((err: Error | null | undefined) => (err ? reject(err) : resolve()));
      });
    } catch (streamErr) {
      writeStream.destroy();
      throw streamErr;
    }

    if (!headerValidated) {
      return NextResponse.json(
        { error: "Empty or invalid SQLite database file" },
        { status: 400 }
      );
    }

    // Use better-sqlite3 backup API to safely restore (atomic, locking-aware)
    const Database = (await import("better-sqlite3")).default;
    const source = new Database(tempPath, { readonly: true });

    try {
      await source.backup(dbPath);
    } finally {
      source.close();
    }

    invalidateProviderCache();
    notifySubscribers({ type: "reload" });

    return NextResponse.json({
      success: true,
      message: "Database restored successfully. Please refresh the page to see updated data.",
      restoredBytes: bytesWritten,
    });
  } catch (err) {
    console.error("Restore error:", err);
    return NextResponse.json(
      { error: "Failed to restore database: " + (err instanceof Error ? err.message : "Unknown error") },
      { status: 500 }
    );
  } finally {
    // Always clean up temp file
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
    }
  }
}

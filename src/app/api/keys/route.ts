import { NextRequest, NextResponse } from "next/server";
import { db, generateApiKey } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { v4 as uuidv4 } from "uuid";
import { checkDashboardAuth } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  if (!checkDashboardAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allKeys = db.select().from(apiKeys).all();
  
  // Parse allowedModels from JSON string to array
  const keysWithParsedModels = allKeys.map((key) => {
    let parsedModels: string[];
    try {
      parsedModels = JSON.parse(key.allowedModels || "[]");
    } catch {
      parsedModels = [];
    }
    return {
      ...key,
      allowedModels: parsedModels,
    };
  });
  
  return NextResponse.json(keysWithParsedModels);
}

export async function POST(req: NextRequest) {
  if (!checkDashboardAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const newKey = {
      id: uuidv4(),
      name,
      key: generateApiKey(),
      enabled: true,
      allowedModels: "[]",
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    };

    db.insert(apiKeys).values(newKey).run();

    return NextResponse.json({
      ...newKey,
      allowedModels: [],
    }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

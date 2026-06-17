import { NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/session";

// In-memory set of SSE subscribers
type Subscriber = (data: string) => void;
const subscribers = new Set<Subscriber>();
const MAX_SUBSCRIBERS = 100;

// Called by the router when a new log entry is created
export function notifySubscribers(event: Record<string, unknown>) {
  const data = JSON.stringify(event);
  for (const sub of subscribers) {
    try {
      sub(data);
    } catch {
      subscribers.delete(sub);
    }
  }
}

function checkAuth(req: NextRequest): boolean {
  const token = req.cookies.get("session_token")?.value;
  return !!token && verifySession(token);
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Enforce max subscribers limit to prevent memory leaks
  if (subscribers.size >= MAX_SUBSCRIBERS) {
    return new Response("Too many SSE connections", { status: 503 });
  }

  const stream = new ReadableStream({
    start(controller) {
      // Send initial ping
      controller.enqueue(`data: ${JSON.stringify({ type: "ping" })}\n\n`);

      const send: Subscriber = (data: string) => {
        controller.enqueue(`data: ${data}\n\n`);
      };

      subscribers.add(send);

      // Heartbeat every 30s to keep connection alive (reduced from 15s)
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(`: heartbeat\n\n`);
        } catch {
          clearInterval(heartbeat);
          subscribers.delete(send);
        }
      }, 30000);

      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        subscribers.delete(send);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

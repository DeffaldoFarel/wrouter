"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { captureException } from "@/lib/sentry";

interface GlobalErrorProps {
  error: Error & { digest?: string };
}

export default function GlobalError({ error }: GlobalErrorProps) {
  useEffect(() => {
    captureException(error, {
      tags: { component: "global-error" },
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="w-full max-w-lg text-center">
            {/* Error code */}
            <p className="mb-4 text-sm font-medium tracking-widest text-red-400 uppercase">
              Application Error
            </p>

            {/* Heading */}
            <h1 className="mb-4 text-4xl font-bold text-zinc-100">
              Something went very wrong
            </h1>

            {/* Description */}
            <p className="mb-8 text-lg text-zinc-400">
              A critical error has occurred and the application couldn&apos;t
              recover. Please try reloading the page.
            </p>

            {/* Error detail */}
            {error.message && (
              <div className="mx-auto mb-8 max-w-md rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-left">
                <p className="wrap-break-words font-mono text-xs text-red-300/70">
                  {error.message}
                </p>
                {error.digest && (
                  <p className="mt-2 text-[10px] text-zinc-600">
                    Error digest: {error.digest}
                  </p>
                )}
              </div>
            )}

            {/* Retry button */}
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-950"
            >
              <RefreshCw className="h-4 w-4" />
              Reload Page
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

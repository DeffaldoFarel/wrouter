"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { captureException } from "@/lib/sentry";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    captureException(error, {
      tags: { component: "error-boundary" },
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-2xl backdrop-blur-sm">
        {/* Icon */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/20">
            <AlertCircle className="h-8 w-8 text-red-400" />
          </div>
        </div>

        {/* Heading */}
        <h2 className="mb-2 text-center text-xl font-semibold text-zinc-100">
          Something went wrong
        </h2>

        {/* Error message */}
        <p className="mb-2 text-center text-sm text-zinc-400">
          An unexpected error occurred while loading this page.
        </p>

        {/* Error detail */}
        <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
          <p className="wrap-break-words font-mono text-xs text-red-300/80">
            {error.message || "Unknown error"}
          </p>
          {error.digest && (
            <p className="mt-1 text-[10px] text-zinc-600">
              Digest: {error.digest}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>
          <button
            onClick={() => (window.location.href = "/")}
            className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
          >
            Go Home
          </button>
        </div>
      </div>
    </div>
  );
}

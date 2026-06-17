import Link from "next/link";
import { Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="text-center">
        {/* 404 number */}
        <h1 className="mb-2 text-8xl font-black tracking-tighter text-zinc-800">
          404
        </h1>

        {/* Heading */}
        <h2 className="mb-3 text-2xl font-semibold text-zinc-100">
          Page not found
        </h2>

        {/* Description */}
        <p className="mx-auto mb-8 max-w-sm text-zinc-400">
          Sorry, the page you&apos;re looking for doesn&apos;t exist or has been
          moved. Let&apos;s get you back on track.
        </p>

        {/* Actions */}
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-950"
          >
            <Home className="h-4 w-4" />
            Go to Dashboard
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/50 px-5 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-950"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </Link>
        </div>
      </div>
    </div>
  );
}

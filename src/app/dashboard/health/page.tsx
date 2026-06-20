"use client";

import { useState, useEffect, useMemo, useCallback, type ElementType } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  MinusCircle,
  HeartPulse,
  Search,
  Download,
  ChevronRight,
  AlertCircle,
  Server,
  Activity,
  Zap,
  Copy,
  ExternalLink,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { getProviderIcon } from "@/components/provider-icons";

// ─────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────

interface HealthResult {
  id: string;
  name: string;
  prefix: string;
  type: string;
  enabled: boolean;
  status: "ok" | "error" | "disabled";
  latencyMs: number | null;
  error: string | null;
  checkedAt?: number;
}

type StatusFilter = "all" | "ok" | "error" | "disabled";

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

function formatRelativeTime(timestamp: number | null | undefined): string {
  if (!timestamp) return "Never";
  const diff = Date.now() - timestamp;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

// ─────────────────────────────────────────────
//  Brand Icon
// ─────────────────────────────────────────────

function MiniBrandIcon({ prefix }: { prefix?: string }) {
  const Icon = useMemo(() => prefix ? getProviderIcon(prefix) : null, [prefix]);
  if (Icon) {
    return (
      <div className="flex items-center justify-center rounded shrink-0 bg-muted/50 border h-6 w-6">
        <Icon size={16} />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center rounded shrink-0 bg-muted h-6 w-6">
      <Server className="h-3 w-3 text-muted-foreground" />
    </div>
  );
}

// ─────────────────────────────────────────────
//  Status Pill & Latency Badge
// ─────────────────────────────────────────────

function StatusPill({ status }: { status: HealthResult["status"] }) {
  const config = {
    ok: {
      label: "Online",
      icon: CheckCircle2,
      className:
        "text-green-700 bg-green-50 border-green-300 dark:text-green-400 dark:bg-green-950/30 dark:border-green-700",
    },
    error: {
      label: "Error",
      icon: XCircle,
      className:
        "text-red-700 bg-red-50 border-red-300 dark:text-red-400 dark:bg-red-950/30 dark:border-red-700",
    },
    disabled: {
      label: "Disabled",
      icon: MinusCircle,
      className: "text-muted-foreground bg-muted border-border",
    },
  }[status];
  const Icon = config.icon;
  return (
    <Badge
      variant="outline"
      className={`text-[10px] gap-1 h-5 px-1.5 ${config.className}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function LatencyBadge({ ms }: { ms: number | null }) {
  if (ms === null) return <span className="text-xs text-muted-foreground">—</span>;
  const color =
    ms < 500
      ? "text-green-600 dark:text-green-400"
      : ms < 1500
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";
  return <span className={`text-xs font-mono font-medium ${color}`}>{ms}ms</span>;
}

// ─────────────────────────────────────────────
//  Stat Card
// ─────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent = "default",
}: {
  icon: ElementType;
  label: string;
  value: string | number;
  hint?: string;
  accent?: "default" | "success" | "warning" | "error";
}) {
  const accentClass = {
    default: "text-foreground",
    success: "text-green-600 dark:text-green-400",
    warning: "text-amber-600 dark:text-amber-400",
    error: "text-red-600 dark:text-red-400",
  }[accent];
  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
              {label}
            </p>
            <p className={`text-2xl font-bold tabular-nums ${accentClass}`}>{value}</p>
            {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
          </div>
          <div className={`rounded-md bg-muted p-2 ${accentClass}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────
//  Detail Sheet
// ─────────────────────────────────────────────

function HealthDetailSheet({
  result,
  onClose,
  onRecheck,
}: {
  result: HealthResult | null;
  onClose: () => void;
  onRecheck: () => void;
}) {
  if (!result) return null;
  return (
    <Sheet open={!!result} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5" />
            Provider Health
          </SheetTitle>
          <SheetDescription>
            Detailed health information for this provider
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 py-4">
          {/* Header card */}
          <div className="flex items-center gap-3 p-3 rounded-md border bg-muted/30">
            <MiniBrandIcon prefix={result.prefix} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{result.name}</p>
              <p className="text-xs text-muted-foreground font-mono">
                {result.prefix}/
              </p>
            </div>
            <StatusPill status={result.status} />
          </div>

          {/* Identity */}
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Identity
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="space-y-0.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  Provider Type
                </p>
                <Badge variant="outline" className="text-[10px]">
                  {result.type === "apikey" ? "API Key Provider" : "Custom"}
                </Badge>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  Enabled
                </p>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    result.enabled
                      ? "text-green-700 border-green-300 dark:text-green-400 dark:border-green-700"
                      : "text-muted-foreground"
                  }`}
                >
                  {result.enabled ? "Yes" : "No"}
                </Badge>
              </div>
              <div className="space-y-0.5 col-span-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  Provider ID
                </p>
                <div className="flex items-center gap-1.5">
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono break-all">
                    {result.id}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(result.id);
                      toast.success("Copied");
                    }}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Performance */}
          <div className="space-y-3 pt-3 border-t">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Performance
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="space-y-0.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  Latency
                </p>
                <p className="text-base font-semibold tabular-nums">
                  {result.latencyMs !== null ? (
                    <LatencyBadge ms={result.latencyMs} />
                  ) : (
                    "—"
                  )}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  Last Checked
                </p>
                <p className="text-sm">
                  {result.checkedAt ? formatRelativeTime(result.checkedAt) : "Never"}
                </p>
              </div>
            </div>
          </div>

          {/* Error / info */}
          {result.error ? (
            <div className="space-y-2 pt-3 border-t">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                Error Details
              </p>
              <div className="rounded-md border border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 p-3">
                <p className="text-sm text-red-700 dark:text-red-400 font-mono break-all whitespace-pre-wrap">
                  {result.error}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(result.error!);
                  toast.success("Error copied");
                }}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <Copy className="h-3 w-3" />
                Copy error
              </button>
            </div>
          ) : result.status === "ok" ? (
            <div className="pt-3 border-t">
              <div className="rounded-md border border-green-300 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20 p-3 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                <p className="text-sm text-green-700 dark:text-green-400">
                  <strong>/models endpoint reachable.</strong> Provider is responding to
                  health checks normally.
                </p>
              </div>
            </div>
          ) : result.status === "disabled" ? (
            <div className="pt-3 border-t">
              <div className="rounded-md border bg-muted/30 p-3 flex items-start gap-2">
                <MinusCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">
                  <strong>Provider is disabled.</strong> Enable it from the provider
                  detail page to start health checks.
                </p>
              </div>
            </div>
          ) : null}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-3 border-t">
            <Button size="sm" variant="outline" onClick={onRecheck}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Re-check
            </Button>
            <Link href={`/dashboard/providers/${result.id}`} className="flex-1">
              <Button size="sm" className="w-full">
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Open Provider
              </Button>
            </Link>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─────────────────────────────────────────────
//  Main Health Page
// ─────────────────────────────────────────────

const CACHE_KEY = "wrouter:health-page-cache";
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export default function HealthCheckPage() {
  const [results, setResults] = useState<HealthResult[]>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.checkedAt && Date.now() - parsed.checkedAt < CACHE_TTL) {
          return parsed.results || [];
        }
      }
    } catch {
      /* ignore */
    }
    return [];
  });
  const [loading, setLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.checkedAt && Date.now() - parsed.checkedAt < CACHE_TTL) {
          return new Date(parsed.checkedAt);
        }
      }
    } catch {
      /* ignore */
    }
    return null;
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedResult, setSelectedResult] = useState<HealthResult | null>(null);

  // Time state for staleness checks (avoids calling Date.now() during render)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const runCheck = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        const data = (await res.json()) as HealthResult[];
        const now = Date.now();
        const enriched = data.map((r) => ({ ...r, checkedAt: now }));
        setResults(enriched);
        setLastChecked(new Date(now));
        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ results: enriched, checkedAt: now })
          );
        } catch {
          /* ignore */
        }
        toast.success(`Checked ${data.length} providers`);
      } else {
        toast.error("Failed to run health check");
      }
    } catch {
      toast.error("Connection error");
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Derived stats ───
  const stats = useMemo(() => {
    const ok = results.filter((r) => r.status === "ok");
    const error = results.filter((r) => r.status === "error").length;
    const disabled = results.filter((r) => r.status === "disabled").length;
    const latencies = ok.map((r) => r.latencyMs).filter((l): l is number => l !== null);
    const avgLatency =
      latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0;
    return { ok: ok.length, error, disabled, avgLatency };
  }, [results]);

  // ─── Filtered list ───
  const filtered = useMemo(() => {
    let list = results;
    if (statusFilter !== "all") {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.prefix.toLowerCase().includes(q) ||
          (r.error || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [results, statusFilter, searchQuery]);

  // ─── Export CSV ───
  function exportCSV() {
    const headers = [
      "Provider",
      "Prefix",
      "Type",
      "Enabled",
      "Status",
      "Latency (ms)",
      "Error",
      "Checked At",
    ];
    const rows = filtered.map((r) => [
      r.name,
      r.prefix,
      r.type === "apikey" ? "API Key" : "Custom",
      r.enabled ? "Yes" : "No",
      r.status,
      r.latencyMs ?? "",
      r.error ?? "",
      r.checkedAt ? new Date(r.checkedAt).toISOString() : "",
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const str = String(cell);
            return str.includes(",") || str.includes('"') || str.includes("\n")
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          })
          .join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wrouter-health-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} providers`);
  }

  const hasResults = results.length > 0;
  const cacheStale = lastChecked ? now - lastChecked.getTime() > 5 * 60 * 1000 : false;

  return (
    <div className="space-y-6">
      {/* ═══ Header ═══ */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <HeartPulse className="h-7 w-7 text-red-500" />
            Health Check
          </h2>
          <p className="text-muted-foreground mt-1">
            Test all provider connections at once
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {lastChecked && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>
                Last checked{" "}
                <span className={cacheStale ? "text-amber-600" : ""}>
                  {formatRelativeTime(lastChecked.getTime())}
                </span>
              </span>
            </div>
          )}
          <Button onClick={runCheck} disabled={loading}>
            <RefreshCw
              className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`}
            />
            {loading ? "Checking..." : hasResults ? "Re-check All" : "Run Health Check"}
          </Button>
        </div>
      </div>

      {/* ═══ Stale cache warning ═══ */}
      {hasResults && cacheStale && (
        <Card className="border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent>
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium">Results are stale</p>
                <p className="text-xs text-muted-foreground mt-1">
                  These results are older than 5 minutes. Click <strong>Re-check All</strong> to
                  get fresh data.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ Stats Overview ═══ */}
      {hasResults && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={CheckCircle2}
            label="Online"
            value={stats.ok}
            hint={`of ${results.length} providers`}
            accent={stats.ok > 0 ? "success" : "default"}
          />
          <StatCard
            icon={XCircle}
            label="Errors"
            value={stats.error}
            hint={stats.error === 0 ? "All good" : "Need attention"}
            accent={stats.error > 0 ? "error" : "default"}
          />
          <StatCard
            icon={MinusCircle}
            label="Disabled"
            value={stats.disabled}
            hint={`${results.length - stats.disabled} active`}
          />
          <StatCard
            icon={Zap}
            label="Avg Latency"
            value={stats.avgLatency > 0 ? `${stats.avgLatency}ms` : "—"}
            hint={
              stats.avgLatency === 0
                ? "No data"
                : stats.avgLatency < 500
                ? "Excellent"
                : stats.avgLatency < 1500
                ? "Acceptable"
                : "Slow"
            }
            accent={
              stats.avgLatency === 0
                ? "default"
                : stats.avgLatency < 500
                ? "success"
                : stats.avgLatency < 1500
                ? "warning"
                : "error"
            }
          />
        </div>
      )}

      {/* ═══ Initial empty state ═══ */}
      {!hasResults && !loading && (
        <Card className="border-dashed border-2">
          <CardContent>
            <div className="py-12 text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                <HeartPulse className="h-8 w-8 text-red-500" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">Ready to check?</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Click <strong>Run Health Check</strong> to test all your providers at
                  once. Results are cached for 30 minutes.
                </p>
              </div>
              <Button onClick={runCheck} disabled={loading}>
                <RefreshCw
                  className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`}
                />
                Run Health Check
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ Loading skeleton (during refresh) ═══ */}
      {loading && !hasResults && (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="h-6 w-6 text-muted-foreground animate-spin" />
              <p className="text-sm text-muted-foreground">Checking providers...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ Search + Filters + Results ═══ */}
      {hasResults && (
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 flex-1 flex-wrap">
                <CardTitle className="text-sm font-semibold">Provider Status</CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  {filtered.length} of {results.length}
                </Badge>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search providers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-8 w-48 text-sm"
                  />
                </div>

                {/* Status filter */}
                <div className="flex items-center gap-0.5 rounded-md border bg-muted p-0.5">
                  {(
                    [
                      { value: "all", label: "All", count: results.length },
                      { value: "ok", label: "Online", count: stats.ok },
                      { value: "error", label: "Error", count: stats.error },
                      { value: "disabled", label: "Disabled", count: stats.disabled },
                    ] as const
                  ).map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setStatusFilter(s.value)}
                      className={`text-xs px-2.5 py-1 rounded-sm transition-colors flex items-center gap-1.5 ${
                        statusFilter === s.value
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s.label}
                      {s.count > 0 && (
                        <span className="text-[9px] opacity-60">{s.count}</span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Export */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportCSV}
                  disabled={filtered.length === 0}
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Export
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16">
                <Activity className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  {searchQuery
                    ? `No providers match "${searchQuery}"`
                    : `No ${statusFilter} providers found.`}
                </p>
                {(searchQuery || statusFilter !== "all") && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setStatusFilter("all");
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b">
                      <TableHead className="pl-4 text-xs font-semibold uppercase tracking-wide">
                        Provider
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide">
                        Type
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide">
                        Status
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-right">
                        Latency
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide">
                        Info
                      </TableHead>
                      <TableHead className="pr-4 text-xs font-semibold uppercase tracking-wide w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow
                        key={r.id}
                        className="group cursor-pointer hover:bg-muted/30"
                        onClick={() => setSelectedResult(r)}
                      >
                        <TableCell className="pl-4 py-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <MiniBrandIcon prefix={r.prefix} />
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">
                                {r.name}
                              </div>
                              <code className="text-[10px] text-muted-foreground font-mono">
                                {r.prefix}/
                              </code>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <Badge variant="outline" className="text-[10px]">
                            {r.type === "apikey" ? "API Key" : "Custom"}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <StatusPill status={r.status} />
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          <LatencyBadge ms={r.latencyMs} />
                        </TableCell>
                        <TableCell className="py-2.5 max-w-[280px]">
                          <span
                            className="text-xs text-muted-foreground truncate block"
                            title={
                              r.error ??
                              (r.status === "ok"
                                ? "/models endpoint reachable"
                                : r.status === "disabled"
                                ? "Provider is disabled"
                                : "")
                            }
                          >
                            {r.error ??
                              (r.status === "ok"
                                ? "/models endpoint reachable"
                                : r.status === "disabled"
                                ? "Provider is disabled"
                                : "")}
                          </span>
                        </TableCell>
                        <TableCell className="pr-4 py-2.5">
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══ Detail Sheet ═══ */}
      <HealthDetailSheet
        result={selectedResult}
        onClose={() => setSelectedResult(null)}
        onRecheck={() => {
          setSelectedResult(null);
          runCheck();
        }}
      />
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ProviderCanvas } from "@/components/provider-canvas";
import { getProviderIcon } from "@/components/provider-icons";
import {
  Activity,
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Timer,
  Zap,
  Wifi,
  WifiOff,
  Download,
  Copy,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  Info,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

// ─────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────

interface LogEntry {
  id: string;
  timestamp: string;
  model: string | null;
  providerId: string | null;
  providerName?: string | null;
  providerPrefix?: string | null;
  comboId: string | null;
  apiKeyId?: string | null;
  apiKeyName?: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  status: string;
  error: string | null;
}

interface DayRequests { date: string; requests: number; errors: number; }
interface DayTokens { date: string; tokensIn: number; tokensOut: number; }
interface ProviderStat {
  providerId: string; name: string; requests: number;
  tokensIn: number; tokensOut: number; errors: number;
  lastUsed: string | null;
}
interface ApiKeyStat {
  apiKeyId: string; name: string; requests: number;
  tokensIn: number; tokensOut: number; errors: number;
  lastUsed: string | null;
}
interface ModelStat {
  model: string; requests: number;
  tokensIn: number; tokensOut: number; errors: number;
  providerCount: number; lastUsed: string | null;
}
interface CanvasProvider { id: string; name: string; enabled: boolean; active: boolean; }
interface HourRequests { hour: string; requests: number; errors: number; }
interface HourTokens { hour: string; tokensIn: number; tokensOut: number; }

interface UsageData {
  filter: string;
  hourly: boolean;
  summary: {
    totalRequests: number; totalErrors: number;
    totalTokensIn: number; totalTokensOut: number; avgLatency: number;
  };
  requestsPerPeriod: (DayRequests | HourRequests)[];
  tokenUsagePerPeriod: (DayTokens | HourTokens)[];
  perProviderBreakdown: ProviderStat[];
  perApiKeyBreakdown: ApiKeyStat[];
  perModelBreakdown: ModelStat[];
  canvasProviders: CanvasProvider[];
  activeJobs: number;
}

interface ProviderInfo {
  id: string;
  prefix: string;
}

// ─────────────────────────────────────────────
//  Constants & Helpers
// ─────────────────────────────────────────────

const COLOR = {
  errors: "#ef4444",
} as const;

const FILTERS = [
  { label: "Today", value: "today" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "60d", value: "60d" },
];

type StatusFilter = "all" | "success" | "error" | "fallback";

function useChartColors() {
  const [tickColor, setTickColor] = useState("#888");
  const [gridColor, setGridColor] = useState("#333");
  const [mutedFg, setMutedFg] = useState("#888");
  const [primaryColor, setPrimaryColor] = useState("#fff");
  const [cardBg, setCardBg] = useState("#1c1c1c");
  const [cardFg, setCardFg] = useState("#fff");
  const [borderColor, setBorderColor] = useState("#333");

  useEffect(() => {
    function readColors() {
      const probe = document.createElement("span");
      probe.style.cssText = "position:absolute;pointer-events:none;opacity:0;";
      probe.className = "text-muted-foreground";
      document.body.appendChild(probe);
      const fg = getComputedStyle(probe).color;
      document.body.removeChild(probe);

      const probe2 = document.createElement("span");
      probe2.style.cssText = "position:absolute;pointer-events:none;opacity:0;border-width:1px;";
      probe2.className = "border-border";
      document.body.appendChild(probe2);
      const border = getComputedStyle(probe2).borderTopColor;
      document.body.removeChild(probe2);

      const probe3 = document.createElement("span");
      probe3.style.cssText = "position:absolute;pointer-events:none;opacity:0;";
      probe3.className = "text-foreground";
      document.body.appendChild(probe3);
      const primary = getComputedStyle(probe3).color;
      document.body.removeChild(probe3);

      const probe4 = document.createElement("span");
      probe4.style.cssText = "position:absolute;pointer-events:none;opacity:0;";
      probe4.className = "bg-card text-card-foreground";
      document.body.appendChild(probe4);
      const cardStyle = getComputedStyle(probe4);
      const bg = cardStyle.backgroundColor;
      const cfg = cardStyle.color;
      document.body.removeChild(probe4);

      setTickColor(fg);
      setMutedFg(fg);
      setGridColor(border);
      setPrimaryColor(primary);
      setCardBg(bg);
      setCardFg(cfg);
      setBorderColor(border);
    }

    readColors();
    const observer = new MutationObserver(readColors);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return { tickColor, gridColor, mutedFg, primaryColor, cardBg, cardFg, borderColor };
}

// Server emits bucket keys in UTC (e.g. "2026-06-18T02" means UTC 2 AM).
// We append "Z" (or use Date.UTC indirectly) so the browser parses as UTC,
// then toLocale* converts to the user's local timezone for display.
function formatDate(isoDate: unknown) {
  if (typeof isoDate !== "string") return String(isoDate ?? "");
  // Treat YYYY-MM-DD as UTC midnight, then format in local zone.
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatHour(isoHour: unknown) {
  if (typeof isoHour !== "string") return String(isoHour ?? "");
  const [datePart, hourPart] = isoHour.split("T");
  // Parse as UTC, display in local time. Example:
  //   server "2026-06-18T02"  → UTC 02:00 → Jakarta (UTC+7) shows "9 AM"
  const d = new Date(`${datePart}T${hourPart}:00:00Z`);
  return d.toLocaleTimeString(undefined, { hour: "numeric", hour12: true });
}

function formatPeriodKey(key: unknown, hourly: boolean) {
  return hourly ? formatHour(key) : formatDate(key);
}

function formatRelativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function normalizeModel(raw: string | null): string {
  if (!raw) return "—";
  const idx = raw.lastIndexOf("/");
  return idx >= 0 ? raw.slice(idx + 1) || raw : raw;
}

// ─────────────────────────────────────────────
//  Brand Icon (mini)
// ─────────────────────────────────────────────

function MiniBrandIcon({ prefix }: { prefix?: string }) {
  const Icon = prefix ? getProviderIcon(prefix) : null;
  if (Icon) {
    return (
      <div className="flex items-center justify-center rounded shrink-0 bg-muted/50 border h-5 w-5">
        <Icon className="h-3.5 w-3.5" />
      </div>
    );
  }
  return null;
}

// ─────────────────────────────────────────────
//  Status Pill
// ─────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; dot: string; icon: React.ElementType }> = {
    success: {
      bg: "bg-emerald-500/10",
      text: "text-emerald-600 dark:text-emerald-400",
      dot: "bg-emerald-500",
      icon: CheckCircle2,
    },
    error: {
      bg: "bg-red-500/10",
      text: "text-red-600 dark:text-red-400",
      dot: "bg-red-500",
      icon: XCircle,
    },
    fallback: {
      bg: "bg-amber-500/10",
      text: "text-amber-600 dark:text-amber-400",
      dot: "bg-amber-500",
      icon: AlertTriangle,
    },
  };
  const style = map[status] ?? {
    bg: "bg-muted",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground",
    icon: Info,
  };
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────
//  Stat Card
// ─────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  variant = "default",
  sublabel,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  variant?: "default" | "error" | "success" | "warning";
  sublabel?: string;
}) {
  const iconBg: Record<string, string> = {
    default: "bg-muted text-muted-foreground",
    error: "bg-red-500/10 text-red-500",
    success: "bg-emerald-500/10 text-emerald-500",
    warning: "bg-amber-500/10 text-amber-500",
  };
  const valueCls: Record<string, string> = {
    default: "text-foreground",
    error: "text-red-500",
    success: "text-emerald-500",
    warning: "text-amber-500",
  };
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {label}
            </p>
            <div className={`rounded-md p-1.5 ${iconBg[variant]}`}>
              <Icon className="h-3.5 w-3.5" />
            </div>
          </div>
          <div>
            <p className={`text-2xl font-bold leading-tight tabular-nums ${valueCls[variant]}`}>
              {value}
            </p>
            {sublabel && <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────
//  Loading Skeleton
// ─────────────────────────────────────────────

function UsageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-32 bg-muted rounded" />
          <div className="h-4 w-64 bg-muted rounded" />
        </div>
        <div className="h-9 w-72 bg-muted rounded-lg" />
      </div>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-24 bg-muted rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-96 bg-muted rounded-lg" />
        <div className="space-y-4">
          <div className="h-44 bg-muted rounded-lg" />
          <div className="h-44 bg-muted rounded-lg" />
        </div>
      </div>
      <div className="h-64 bg-muted rounded-lg" />
      <div className="h-96 bg-muted rounded-lg" />
    </div>
  );
}

// ─────────────────────────────────────────────
//  Breakdown Table
// ─────────────────────────────────────────────

type BreakdownMode = "provider" | "apikey" | "model";

function BreakdownTable({
  perProviderBreakdown,
  perApiKeyBreakdown,
  perModelBreakdown,
  providersById,
}: {
  perProviderBreakdown: ProviderStat[];
  perApiKeyBreakdown: ApiKeyStat[];
  perModelBreakdown: ModelStat[];
  providersById: Record<string, ProviderInfo>;
}) {
  const [mode, setMode] = useState<BreakdownMode>("provider");

  const hasApiKeys = perApiKeyBreakdown.length > 0;
  const hasProviders = perProviderBreakdown.length > 0;
  const hasModels = perModelBreakdown.length > 0;

  const rows =
    mode === "provider"
      ? perProviderBreakdown.map((p) => ({
          id: p.providerId,
          name: p.name,
          prefix: providersById[p.providerId]?.prefix,
          requests: p.requests,
          errors: p.errors,
          tokensIn: p.tokensIn,
          tokensOut: p.tokensOut,
          lastUsed: p.lastUsed,
          providerCount: null,
        }))
      : mode === "apikey"
      ? perApiKeyBreakdown.map((k) => ({
          id: k.apiKeyId,
          name: k.name,
          prefix: undefined,
          requests: k.requests,
          errors: k.errors,
          tokensIn: k.tokensIn,
          tokensOut: k.tokensOut,
          lastUsed: k.lastUsed,
          providerCount: null,
        }))
      : perModelBreakdown.map((m) => ({
          id: m.model,
          name: m.model,
          prefix: undefined,
          requests: m.requests,
          errors: m.errors,
          tokensIn: m.tokensIn,
          tokensOut: m.tokensOut,
          lastUsed: m.lastUsed,
          providerCount: m.providerCount,
        }));

  const modeLabel = mode === "provider" ? "providers" : mode === "apikey" ? "keys" : "models";
  const nameHeader = mode === "provider" ? "Provider" : mode === "apikey" ? "API Key" : "Model";

  return (
    <Card>
      <div className="flex flex-row items-center justify-between py-3 px-4 border-b flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Usage Breakdown</span>
          <Badge variant="secondary" className="text-[10px]">
            {rows.length} {modeLabel}
          </Badge>
        </div>
        <div className="flex items-center gap-1 rounded-md border bg-muted p-0.5">
          {hasProviders && (
            <button
              type="button"
              onClick={() => setMode("provider")}
              className={`text-xs px-3 py-1 rounded-sm transition-colors ${
                mode === "provider"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              By Provider
            </button>
          )}
          {hasApiKeys && (
            <button
              type="button"
              onClick={() => setMode("apikey")}
              className={`text-xs px-3 py-1 rounded-sm transition-colors ${
                mode === "apikey"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              By API Key
            </button>
          )}
          {hasModels && (
            <button
              type="button"
              onClick={() => setMode("model")}
              className={`text-xs px-3 py-1 rounded-sm transition-colors ${
                mode === "model"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              By Model
            </button>
          )}
        </div>
      </div>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b">
                <TableHead
                  className={`pl-4 text-xs font-semibold uppercase tracking-wide ${
                    mode === "model" ? "w-60" : "w-48"
                  }`}
                >
                  {nameHeader}
                </TableHead>
                {mode === "model" && (
                  <TableHead className="text-xs font-semibold uppercase tracking-wide">
                    Providers
                  </TableHead>
                )}
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-right">
                  Requests
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-right">
                  Errors
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-right">
                  Tokens In
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-right">
                  Tokens Out
                </TableHead>
                <TableHead className="pr-4 text-xs font-semibold uppercase tracking-wide">
                  Last Used
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const errorRate =
                  row.requests > 0
                    ? ((row.errors / row.requests) * 100).toFixed(1)
                    : "0.0";
                return (
                  <TableRow key={row.id} className="hover:bg-muted/20">
                    <TableCell className={`pl-4 py-2.5 ${mode === "model" ? "max-w-60" : ""}`}>
                      <div className="flex items-center gap-2">
                        {mode === "provider" && row.prefix && (
                          <MiniBrandIcon prefix={row.prefix} />
                        )}
                        <span
                          className={`font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground ${
                            mode === "model" ? "break-all" : ""
                          }`}
                        >
                          {row.name}
                        </span>
                      </div>
                    </TableCell>
                    {mode === "model" && (
                      <TableCell className="py-2.5 tabular-nums">
                        <span className="text-xs bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded font-medium">
                          {row.providerCount}
                        </span>
                      </TableCell>
                    )}
                    <TableCell className="py-2.5 font-medium tabular-nums text-right">
                      {row.requests.toLocaleString()}
                    </TableCell>
                    <TableCell className="py-2.5 tabular-nums text-right">
                      {row.errors > 0 ? (
                        <span className="text-red-500 font-medium">
                          {row.errors}
                          <span className="text-xs font-normal ml-1 text-muted-foreground">
                            ({errorRate}%)
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 tabular-nums text-muted-foreground text-right">
                      {row.tokensIn.toLocaleString()}
                    </TableCell>
                    <TableCell className="pr-4 py-2.5 tabular-nums text-muted-foreground text-right">
                      {row.tokensOut.toLocaleString()}
                    </TableCell>
                    <TableCell className="pr-4 py-2.5 text-xs text-muted-foreground">
                      {row.lastUsed ? formatRelativeTime(row.lastUsed) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────
//  Log Detail Sheet (right drawer)
// ─────────────────────────────────────────────

function LogDetailSheet({
  log,
  providerName,
  onClose,
}: {
  log: LogEntry | null;
  providerName: string;
  onClose: () => void;
}) {
  if (!log) return null;
  const totalTokens = (log.tokensIn ?? 0) + (log.tokensOut ?? 0);
  return (
    <Sheet open={!!log} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto"
      >
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Request Details
          </SheetTitle>
          <SheetDescription>
            Full information about this request
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 py-4">
          {/* Status banner */}
          <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
            <StatusPill status={log.status} />
            <span className="text-xs text-muted-foreground">
              {new Date(log.timestamp).toLocaleString()}
            </span>
          </div>

          {/* Section: Identity */}
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Identity
            </p>
            <div className="grid grid-cols-1 gap-3 text-sm">
              <div className="space-y-0.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  Request ID
                </p>
                <div className="flex items-center gap-1.5">
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono break-all">
                    {log.id}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(log.id);
                      toast.success("Copied");
                    }}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  API Key
                </p>
                {log.apiKeyName ? (
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-xs">
                      {log.apiKeyName}
                    </Badge>
                    {log.apiKeyId && (
                      <code className="text-[10px] text-muted-foreground font-mono">
                        {log.apiKeyId.slice(0, 8)}…
                      </code>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {log.apiKeyId ? `(deleted: ${log.apiKeyId.slice(0, 8)}…)` : "—"}
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  Provider
                </p>
                <div className="flex items-center gap-1.5">
                  <MiniBrandIcon prefix={log.providerPrefix ?? undefined} />
                  <span className="text-sm">{providerName}</span>
                </div>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  Model
                </p>
                <div className="flex items-center gap-1.5">
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono break-all">
                    {log.model || "—"}
                  </code>
                  {log.model && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(log.model!);
                        toast.success("Copied");
                      }}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section: Performance */}
          <div className="space-y-3 pt-3 border-t">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Performance & Tokens
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="space-y-0.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  Latency
                </p>
                <p
                  className={`text-base font-semibold tabular-nums ${
                    (log.latencyMs ?? 0) > 3000 ? "text-amber-500" : ""
                  }`}
                >
                  {log.latencyMs ? `${log.latencyMs}ms` : "—"}
                </p>
                {(log.latencyMs ?? 0) > 3000 && (
                  <p className="text-[10px] text-amber-500">Above 3s threshold</p>
                )}
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  Total Tokens
                </p>
                <p className="text-base font-semibold tabular-nums">
                  {totalTokens.toLocaleString()}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  Tokens In
                </p>
                <p className="text-sm tabular-nums">
                  {(log.tokensIn ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  Tokens Out
                </p>
                <p className="text-sm tabular-nums">
                  {(log.tokensOut ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Error details */}
          {log.error && (
            <div className="space-y-2 pt-3 border-t">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                Error Details
              </p>
              <div className="rounded-md border border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 p-3">
                <p className="text-sm text-red-700 dark:text-red-400 font-mono break-all whitespace-pre-wrap">
                  {log.error}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(log.error!);
                  toast.success("Error copied");
                }}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <Copy className="h-3 w-3" />
                Copy error
              </button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─────────────────────────────────────────────
//  Main Page
// ─────────────────────────────────────────────

export default function UsagePage() {
  const [filter, setFilter] = useState("24h");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sseConnected, setSseConnected] = useState(false);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [providersById, setProvidersById] = useState<Record<string, ProviderInfo>>({});
  const sseRef = useRef<EventSource | null>(null);
  const { tickColor, gridColor, mutedFg, primaryColor, cardBg, cardFg, borderColor } =
    useChartColors();

  const [activeProviderIds, setActiveProviderIds] = useState<Set<string>>(new Set());
  const activeTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const tooltipStyle = {
    backgroundColor: cardBg,
    border: `1px solid ${borderColor}`,
    borderRadius: 8,
    fontSize: 13,
    color: cardFg,
    boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
  };

  // Build provider ID → name map
  const providerMap: Record<string, string> = {};
  if (usage?.canvasProviders) {
    for (const p of usage.canvasProviders) {
      providerMap[p.id] = p.name;
    }
  }
  if (usage?.perProviderBreakdown) {
    for (const p of usage.perProviderBreakdown) {
      if (!providerMap[p.providerId]) {
        providerMap[p.providerId] = p.name;
      }
    }
  }

  const PAGE_SIZE = 50;

  const fetchAll = useCallback(async (f: string) => {
    try {
      const [ur, lr, pr] = await Promise.all([
        fetch(`/api/usage?filter=${f}`),
        fetch(`/api/logs?limit=${PAGE_SIZE}`),
        fetch("/api/providers"),
      ]);
      if (ur.ok) setUsage(await ur.json());
      if (lr.ok) {
        const lrData = await lr.json();
        setLogs(lrData.logs);
        setLogsTotal(lrData.total ?? lrData.logs.length);
      }
      if (pr.ok) {
        const providers = await pr.json();
        const byId: Record<string, ProviderInfo> = {};
        for (const p of providers) {
          byId[p.id] = { id: p.id, prefix: p.prefix };
        }
        setProvidersById(byId);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  // Load more: append older logs from server (offset = current count)
  const loadMoreLogs = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/logs?limit=${PAGE_SIZE}&offset=${logs.length}`
      );
      if (res.ok) {
        const data = await res.json();
        setLogs((prev) => {
          // De-dup by id in case of overlap from real-time inserts
          const existingIds = new Set(prev.map((l) => l.id));
          const newLogs = (data.logs as LogEntry[]).filter(
            (l) => !existingIds.has(l.id)
          );
          return [...prev, ...newLogs];
        });
        setLogsTotal(data.total ?? logsTotal);
      }
    } catch {
      toast.error("Failed to load more logs");
    } finally {
      setLoadingMore(false);
    }
  }, [logs.length, logsTotal, loadingMore]);

  // SSE connection
  useEffect(() => {
    let es: EventSource;
    let retries = 0;
    let reconnectTimeout: NodeJS.Timeout;

    function connectSSE() {
      es = new EventSource("/api/events");
      sseRef.current = es;

      es.onopen = () => {
        retries = 0;
        setSseConnected(true);
      };

      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "request-start") {
            const pid = msg.providerId as string;
            setActiveProviderIds((prev) => new Set(prev).add(pid));
            const existing = activeTimeoutsRef.current.get(pid);
            if (existing) clearTimeout(existing);
            activeTimeoutsRef.current.set(
              pid,
              setTimeout(() => {
                setActiveProviderIds((prev) => {
                  const next = new Set(prev);
                  next.delete(pid);
                  return next;
                });
                activeTimeoutsRef.current.delete(pid);
              }, 60000)
            );
          }
          if (msg.type === "log") {
            const logData = msg.data as LogEntry;
            if (logData.providerId) {
              setActiveProviderIds((prev) => {
                const next = new Set(prev);
                next.delete(logData.providerId!);
                return next;
              });
              const timeout = activeTimeoutsRef.current.get(logData.providerId);
              if (timeout) {
                clearTimeout(timeout);
                activeTimeoutsRef.current.delete(logData.providerId);
              }
            }
            // Real-time prepend: keep all existing logs (no drop) so Load More
            // stays consistent. Cap at 500 as a safety net to avoid runaway memory.
            setLogs((p) => {
              const newLog = msg.data as LogEntry;
              if (p.some((l) => l.id === newLog.id)) return p;
              return [newLog, ...p].slice(0, 500);
            });
            setLogsTotal((t) => t + 1);
            setFilter((cur) => {
              fetchAll(cur);
              return cur;
            });
          }
        } catch {
          /* ignore */
        }
      };

      es.onerror = () => {
        es.close();
        setSseConnected(false);
        const delay = Math.min(1000 * Math.pow(2, retries), 30000);
        retries++;
        reconnectTimeout = setTimeout(connectSSE, delay);
      };
    }

    connectSSE();

    return () => {
      clearTimeout(reconnectTimeout);
      es?.close();
      for (const timeout of activeTimeoutsRef.current.values()) {
        clearTimeout(timeout);
      }
      activeTimeoutsRef.current.clear();
    };
  }, [fetchAll]);

  useEffect(() => {
    setLoading(true);
    fetchAll(filter);
  }, [filter, fetchAll]);

  // Filter logs by status
  const filteredLogs = useMemo(() => {
    if (statusFilter === "all") return logs;
    return logs.filter((l) => l.status === statusFilter);
  }, [logs, statusFilter]);

  // Export logs as CSV
  function exportCSV() {
    const headers = [
      "Timestamp",
      "API Key",
      "Provider",
      "Model",
      "Status",
      "Latency (ms)",
      "Tokens In",
      "Tokens Out",
      "Error",
    ];
    const rows = filteredLogs.map((log) => [
      log.timestamp,
      log.apiKeyName ?? (log.apiKeyId ? `(deleted:${log.apiKeyId})` : ""),
      log.providerName ||
        (log.providerId ? providerMap[log.providerId] || log.providerId : ""),
      log.model || "",
      log.status,
      log.latencyMs ?? "",
      log.tokensIn ?? "",
      log.tokensOut ?? "",
      log.error ?? "",
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
    a.download = `wrouter-logs-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredLogs.length} log${filteredLogs.length !== 1 ? "s" : ""}`);
  }

  if (loading) return <UsageSkeleton />;

  const s = usage?.summary;
  const hasErrors = (s?.totalErrors ?? 0) > 0;
  const errorRate =
    s && s.totalRequests > 0
      ? `${((s.totalErrors / s.totalRequests) * 100).toFixed(1)}% error rate`
      : undefined;

  const successCount = logs.filter((l) => l.status === "success").length;
  const errorCount = logs.filter((l) => l.status === "error").length;
  const fallbackCount = logs.filter((l) => l.status === "fallback").length;

  return (
    <div className="space-y-6">
      {/* ═══ Header ═══ */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-3xl font-bold tracking-tight">Usage</h2>
            <Badge
              variant="outline"
              className={`text-[10px] gap-1 ${
                sseConnected
                  ? "text-green-700 border-green-300 bg-green-50 dark:text-green-400 dark:border-green-700 dark:bg-green-950/30"
                  : "text-muted-foreground"
              }`}
              title={sseConnected ? "Real-time updates connected" : "Reconnecting..."}
            >
              {sseConnected ? (
                <>
                  <Wifi className="h-3 w-3" />
                  Live
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" />
                  Reconnecting
                </>
              )}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            Real-time analytics and request history
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Refresh */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLoading(true);
              fetchAll(filter);
            }}
            title="Refresh data"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>

          {/* Filter pill group */}
          <div className="flex items-center gap-0.5 rounded-lg border bg-muted/50 p-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  filter === f.value
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ Stat Cards ═══ */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Total Requests"
          value={(s?.totalRequests ?? 0).toLocaleString()}
          icon={Activity}
        />
        <StatCard
          label="Errors"
          value={s?.totalErrors ?? 0}
          icon={AlertCircle}
          variant={hasErrors ? "error" : "default"}
          sublabel={hasErrors ? errorRate : undefined}
        />
        <StatCard
          label="Input Tokens"
          value={(s?.totalTokensIn ?? 0).toLocaleString()}
          icon={ArrowDownToLine}
        />
        <StatCard
          label="Output Tokens"
          value={(s?.totalTokensOut ?? 0).toLocaleString()}
          icon={ArrowUpFromLine}
          variant="success"
        />
        <StatCard
          label="Avg Latency"
          value={s?.avgLatency ? `${s.avgLatency}ms` : "—"}
          icon={Timer}
          variant={s?.avgLatency && s.avgLatency > 3000 ? "warning" : "default"}
          sublabel={
            s?.avgLatency && s.avgLatency > 3000 ? "above 3s threshold" : undefined
          }
        />
      </div>

      {/* ═══ Empty state when no requests ═══ */}
      {(s?.totalRequests ?? 0) === 0 && logs.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent>
            <div className="py-12 text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Activity className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">No usage data yet</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Start sending requests to your WRouter endpoint and analytics will
                  appear here in real-time.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ═══ Connection Map + Charts ═══ */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Connection Map */}
            <Card className="overflow-hidden flex flex-col">
              <CardHeader className="border-b">
                <div className="flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Connection Map</CardTitle>
                  <span className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {activeProviderIds.size}
                    </span>
                    {" active / "}
                    {usage?.canvasProviders.length ?? 0} providers
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-0 flex-1 min-h-0">
                <div className="w-full h-full" style={{ minHeight: 380 }}>
                  <ProviderCanvas
                    providers={(usage?.canvasProviders ?? []).map((p) => ({
                      ...p,
                      active: activeProviderIds.has(p.id),
                      prefix: providersById[p.id]?.prefix,
                    }))}
                    activeJobs={
                      activeProviderIds.size > 0
                        ? activeProviderIds.size
                        : usage?.activeJobs ?? 0
                    }
                  />
                </div>
              </CardContent>
            </Card>

            {/* Charts stacked */}
            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader className="border-b">
                  <CardTitle className="text-sm font-semibold">
                    {usage?.hourly ? "Requests per Hour" : "Requests per Day"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 px-2 pb-3">
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={usage?.requestsPerPeriod ?? []}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={gridColor}
                        vertical={false}
                      />
                      <XAxis
                        dataKey={usage?.hourly ? "hour" : "date"}
                        tickFormatter={(v) => formatPeriodKey(v, usage?.hourly ?? false)}
                        tick={{ fontSize: 11, fill: tickColor }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: tickColor }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                        width={28}
                      />
                      <Tooltip
                        labelFormatter={(v) => formatPeriodKey(v, usage?.hourly ?? false)}
                        contentStyle={tooltipStyle}
                      />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                      <Line
                        type="monotone"
                        dataKey="requests"
                        name="Requests"
                        stroke={primaryColor}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: primaryColor }}
                      />
                      <Line
                        type="monotone"
                        dataKey="errors"
                        name="Errors"
                        stroke={COLOR.errors}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: COLOR.errors }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="border-b">
                  <CardTitle className="text-sm font-semibold">
                    {usage?.hourly ? "Token Usage per Hour" : "Token Usage per Day"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 px-2 pb-3">
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={usage?.tokenUsagePerPeriod ?? []}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={gridColor}
                        vertical={false}
                      />
                      <XAxis
                        dataKey={usage?.hourly ? "hour" : "date"}
                        tickFormatter={(v) => formatPeriodKey(v, usage?.hourly ?? false)}
                        tick={{ fontSize: 11, fill: tickColor }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: tickColor }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                        width={36}
                      />
                      <Tooltip
                        labelFormatter={(v) => formatPeriodKey(v, usage?.hourly ?? false)}
                        contentStyle={tooltipStyle}
                      />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                      <Line
                        type="monotone"
                        dataKey="tokensIn"
                        name="Input"
                        stroke={primaryColor}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: primaryColor }}
                      />
                      <Line
                        type="monotone"
                        dataKey="tokensOut"
                        name="Output"
                        stroke={mutedFg}
                        strokeWidth={2}
                        strokeDasharray="4 3"
                        dot={false}
                        activeDot={{ r: 4, fill: mutedFg }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ═══ Usage Breakdown ═══ */}
          {usage &&
            (usage.perProviderBreakdown.length > 0 ||
              usage.perApiKeyBreakdown.length > 0 ||
              usage.perModelBreakdown?.length > 0) && (
              <BreakdownTable
                perProviderBreakdown={usage.perProviderBreakdown}
                perApiKeyBreakdown={usage.perApiKeyBreakdown}
                perModelBreakdown={usage.perModelBreakdown ?? []}
                providersById={providersById}
              />
            )}

          {/* ═══ Recent Requests ═══ */}
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-sm font-semibold">Recent Requests</CardTitle>
                  <Badge variant="secondary" className="text-[10px]">
                    {statusFilter === "all"
                      ? `Showing ${logs.length} of ${logsTotal}`
                      : `${filteredLogs.length} ${statusFilter} (${logs.length} loaded)`}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  {/* Status filter */}
                  <div className="flex items-center gap-0.5 rounded-md border bg-muted p-0.5">
                    {(
                      [
                        { value: "all", label: "All", count: logs.length },
                        { value: "success", label: "Success", count: successCount },
                        { value: "error", label: "Error", count: errorCount },
                        { value: "fallback", label: "Fallback", count: fallbackCount },
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
                    disabled={filteredLogs.length === 0}
                  >
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredLogs.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16">
                  <Activity className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    {logs.length === 0
                      ? "No requests logged yet."
                      : `No ${statusFilter} requests found.`}
                  </p>
                  {logs.length > 0 && statusFilter !== "all" && (
                    <button
                      onClick={() => setStatusFilter("all")}
                      className="text-xs text-primary hover:underline"
                    >
                      Show all requests
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent border-b">
                        <TableHead className="pl-4 text-xs font-semibold uppercase tracking-wide">
                          Time
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wide">
                          API Key
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wide">
                          Provider
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wide">
                          Model
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wide">
                          Status
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wide text-right">
                          Latency
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wide text-right">
                          Tokens
                        </TableHead>
                        <TableHead className="pr-4 text-xs font-semibold uppercase tracking-wide w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLogs.map((log) => {
                        const slowLatency = (log.latencyMs ?? 0) > 3000;
                        const providerName =
                          log.providerName ||
                          (log.providerId
                            ? providerMap[log.providerId] || log.providerId.slice(0, 8)
                            : "—");
                        const providerPrefix =
                          log.providerPrefix ??
                          (log.providerId ? providersById[log.providerId]?.prefix : undefined);
                        return (
                          <TableRow
                            key={log.id}
                            className="group cursor-pointer hover:bg-muted/30"
                            onClick={() => setSelectedLog(log)}
                          >
                            <TableCell className="pl-4 py-2.5">
                              <div className="text-xs font-medium">
                                {formatRelativeTime(log.timestamp)}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {new Date(log.timestamp).toLocaleTimeString()}
                              </div>
                            </TableCell>
                            <TableCell className="py-2.5">
                              {log.apiKeyName ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 h-5 max-w-[140px] truncate"
                                  title={log.apiKeyName}
                                >
                                  {log.apiKeyName}
                                </Badge>
                              ) : log.apiKeyId ? (
                                <span
                                  className="text-[10px] text-muted-foreground italic"
                                  title={`Deleted key: ${log.apiKeyId}`}
                                >
                                  (deleted)
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="py-2.5">
                              <div className="flex items-center gap-1.5">
                                <MiniBrandIcon prefix={providerPrefix ?? undefined} />
                                <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                                  {providerName}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="py-2.5">
                              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground max-w-[180px] block truncate">
                                {normalizeModel(log.model)}
                              </span>
                            </TableCell>
                            <TableCell className="py-2.5">
                              <StatusPill status={log.status} />
                            </TableCell>
                            <TableCell className="text-sm tabular-nums py-2.5 text-right">
                              {log.latencyMs ? (
                                <span
                                  className={
                                    slowLatency
                                      ? "text-amber-500 font-medium"
                                      : "text-muted-foreground"
                                  }
                                >
                                  {log.latencyMs}ms
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums py-2.5 text-right">
                              {log.tokensIn || log.tokensOut ? (
                                <span className="inline-flex items-center gap-1">
                                  <span className="text-foreground">
                                    {(log.tokensIn ?? 0).toLocaleString()}
                                  </span>
                                  <span className="text-border">/</span>
                                  <span className="text-muted-foreground">
                                    {(log.tokensOut ?? 0).toLocaleString()}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="pr-4 py-2.5">
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>

                  {/* Load More button */}
                  {logs.length < logsTotal && (
                    <div className="flex items-center justify-center gap-3 py-4 border-t bg-muted/20">
                      <span className="text-xs text-muted-foreground">
                        {logsTotal - logs.length} more log
                        {logsTotal - logs.length !== 1 ? "s" : ""} available
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={loadMoreLogs}
                        disabled={loadingMore}
                      >
                        {loadingMore ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <ArrowDownToLine className="h-3.5 w-3.5 mr-1" />
                            Load {Math.min(PAGE_SIZE, logsTotal - logs.length)} more
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {/* End-of-list indicator */}
                  {logs.length >= logsTotal && logs.length > PAGE_SIZE && (
                    <div className="text-center py-4 border-t bg-muted/20">
                      <span className="text-xs text-muted-foreground">
                        — End of logs ({logsTotal} total) —
                      </span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Log Detail Sheet */}
      <LogDetailSheet
        log={selectedLog}
        providerName={
          selectedLog?.providerName ||
          (selectedLog?.providerId
            ? providerMap[selectedLog.providerId] || "Unknown"
            : "—")
        }
        onClose={() => setSelectedLog(null)}
      />
    </div>
  );
}

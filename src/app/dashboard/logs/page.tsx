"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Activity,
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Timer,
  Zap,
} from "lucide-react";

// ---- Types ----

interface LogEntry {
  id: string;
  timestamp: string;
  model: string | null;
  providerId: string | null;
  comboId: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  status: string;
  error: string | null;
}

interface DayRequests  { date: string; requests: number; errors: number; }
interface DayTokens    { date: string; tokensIn: number; tokensOut: number; }
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
interface HourTokens   { hour: string; tokensIn: number; tokensOut: number; }

interface UsageData {
  filter: string;
  hourly: boolean;
  summary: {
    totalRequests: number; totalErrors: number;
    totalTokensIn: number; totalTokensOut: number; avgLatency: number;
  };
  requestsPerPeriod:   (DayRequests | HourRequests)[];
  tokenUsagePerPeriod: (DayTokens   | HourTokens)[];
  perProviderBreakdown: ProviderStat[];
  perApiKeyBreakdown: ApiKeyStat[];
  perModelBreakdown: ModelStat[];
  canvasProviders: CanvasProvider[];
  activeJobs: number;
}

// ---- Design tokens (semantic, consistent) ----

// These are the ONLY colors used outside of CSS vars throughout this file.
// Keeping them here makes future theme changes a one-liner.
const COLOR = {
  requests:  "#6366f1",   // indigo-500  — visible on both light & dark backgrounds
  errors:    "#ef4444",   // red-500     — semantic for errors
  tokenIn:   "#6366f1",   // indigo-500  — consistent with requests
  tokenOut:  "#a78bfa",   // violet-400  — softer sibling, still readable on dark
} as const;

// ---- Helpers ----

const FILTERS = [
  { label: "Today", value: "today" },
  { label: "24h",   value: "24h"   },
  { label: "7d",    value: "7d"    },
  { label: "30d",   value: "30d"   },
  { label: "60d",   value: "60d"   },
];

const TOOLTIP_STYLE = {
  background:      "hsl(var(--card))",
  backgroundColor: "hsl(var(--card))",
  border:          "1px solid hsl(var(--border))",
  borderRadius:    8,
  fontSize:        13,
  color:           "hsl(var(--card-foreground))",
  boxShadow:       "0 4px 16px rgba(0,0,0,0.18)",
  opacity:         1,
};

// Recharts renders ticks as SVG <text> — CSS vars don't resolve in SVG fill attributes.
// We read actual computed colors from a real DOM element so oklch/hsl values are fully
// resolved. We also watch for dark-mode class changes so charts update on theme switch.
function useChartColors() {
  const [tickColor,    setTickColor]    = useState("#888");
  const [gridColor,    setGridColor]    = useState("#333");
  const [mutedFg,      setMutedFg]      = useState("#888");
  const [primaryColor, setPrimaryColor] = useState("#fff");
  const [cardBg,       setCardBg]       = useState("#1c1c1c");
  const [cardFg,       setCardFg]       = useState("#fff");
  const [borderColor,  setBorderColor]  = useState("#333");

  useEffect(() => {
    // Create a tiny invisible element and read its computed color — this forces
    // the browser to fully resolve oklch/hsl vars including dark-mode overrides.
    function readColors() {
      const probe = document.createElement("span");
      probe.style.cssText = "position:absolute;pointer-events:none;opacity:0;";
      probe.className = "text-muted-foreground";
      document.body.appendChild(probe);
      const fg = getComputedStyle(probe).color;
      document.body.removeChild(probe);

      // Border color
      const probe2 = document.createElement("span");
      probe2.style.cssText = "position:absolute;pointer-events:none;opacity:0;border-width:1px;";
      probe2.className = "border-border";
      document.body.appendChild(probe2);
      const border = getComputedStyle(probe2).borderTopColor;
      document.body.removeChild(probe2);

      // Primary color (foreground) — white on dark, near-black on light
      const probe3 = document.createElement("span");
      probe3.style.cssText = "position:absolute;pointer-events:none;opacity:0;";
      probe3.className = "text-foreground";
      document.body.appendChild(probe3);
      const primary = getComputedStyle(probe3).color;
      document.body.removeChild(probe3);

      // Card background — read via background-color
      const probe4 = document.createElement("span");
      probe4.style.cssText = "position:absolute;pointer-events:none;opacity:0;";
      probe4.className = "bg-card text-card-foreground";
      document.body.appendChild(probe4);
      const cardStyle = getComputedStyle(probe4);
      const bg  = cardStyle.backgroundColor;
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

    // Re-read when the theme class changes on <html>
    const observer = new MutationObserver(readColors);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return { tickColor, gridColor, mutedFg, primaryColor, cardBg, cardFg, borderColor };
}

function formatDate(isoDate: unknown) {
  if (typeof isoDate !== "string") return String(isoDate ?? "");
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatHour(isoHour: unknown) {
  if (typeof isoHour !== "string") return String(isoHour ?? "");
  const [datePart, hourPart] = isoHour.split("T");
  const d = new Date(`${datePart}T${hourPart}:00:00`);
  return d.toLocaleTimeString(undefined, { hour: "numeric", hour12: true });
}

function formatPeriodKey(key: unknown, hourly: boolean) {
  return hourly ? formatHour(key) : formatDate(key);
}

function formatTimestamp(ts: string) {
  const d = new Date(ts);
  return { date: d.toLocaleDateString(), time: d.toLocaleTimeString() };
}

// ---- Sub-components ----

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    success:  { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
    error:    { bg: "bg-red-500/10",     text: "text-red-600 dark:text-red-400",         dot: "bg-red-500"     },
    fallback: { bg: "bg-amber-500/10",   text: "text-amber-600 dark:text-amber-400",     dot: "bg-amber-500"   },
  };
  const style = map[status] ?? { bg: "bg-muted", text: "text-muted-foreground", dot: "bg-muted-foreground" };
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {label}
    </span>
  );
}

interface StatCardProps {
  label:     string;
  value:     string | number;
  icon:      React.ElementType;
  variant?:  "default" | "error" | "success" | "warning";
  sublabel?: string;
}

function StatCard({ label, value, icon: Icon, variant = "default", sublabel }: StatCardProps) {
  const iconBg: Record<string, string> = {
    default: "bg-muted text-muted-foreground",
    error:   "bg-red-500/10 text-red-500",
    success: "bg-emerald-500/10 text-emerald-500",
    warning: "bg-amber-500/10 text-amber-500",
  };
  const valueCls: Record<string, string> = {
    default: "text-foreground",
    error:   "text-red-500",
    success: "text-emerald-500",
    warning: "text-amber-500",
  };
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex flex-col gap-3 py-4 px-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          <div className={`rounded-md p-1.5 ${iconBg[variant]}`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        </div>
        <div>
          <p className={`text-2xl font-bold leading-tight tabular-nums ${valueCls[variant]}`}>{value}</p>
          {sublabel && <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

interface SectionHeaderProps {
  title:    string;
  trailing?: React.ReactNode;
}

function SectionHeader({ title, trailing }: SectionHeaderProps) {
  return (
    <CardHeader className="flex flex-row items-center justify-between py-3 px-4 border-b">
      <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      {trailing && <span className="text-xs text-muted-foreground">{trailing}</span>}
    </CardHeader>
  );
}

// ---- BreakdownTable: unified Provider / API Key / Model table with dropdown ----
type BreakdownMode = "provider" | "apikey" | "model";

function BreakdownTable({
  perProviderBreakdown,
  perApiKeyBreakdown,
  perModelBreakdown,
}: {
  perProviderBreakdown: ProviderStat[];
  perApiKeyBreakdown: ApiKeyStat[];
  perModelBreakdown: ModelStat[];
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
      {/* Header with toggle */}
      <div className="flex flex-row items-center justify-between py-3 px-4 border-b">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Usage Breakdown</span>
          <span className="text-xs text-muted-foreground">
            {rows.length} {modeLabel}
          </span>
        </div>
        {/* Toggle pill */}
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
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b">
              <TableHead className={`pl-4 text-xs font-semibold uppercase tracking-wide ${mode === "model" ? "w-60" : "w-40"}`}>
                {nameHeader}
              </TableHead>
              {mode === "model" && (
                <TableHead className="text-xs font-semibold uppercase tracking-wide">Providers</TableHead>
              )}
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Requests</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Errors</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Tokens In</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Tokens Out</TableHead>
              <TableHead className="pr-4 text-xs font-semibold uppercase tracking-wide">Last Used</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const errorRate =
                row.requests > 0
                  ? ((row.errors / row.requests) * 100).toFixed(1)
                  : "0.0";
              return (
                <TableRow key={row.id}>
                  <TableCell className={`pl-4 py-2.5 ${mode === "model" ? "max-w-60" : ""}`}>
                    <span className={`font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground ${mode === "model" ? "break-all" : ""}`}>
                      {row.name}
                    </span>
                  </TableCell>
                  {mode === "model" && (
                    <TableCell className="py-2.5 tabular-nums">
                      <span className="text-xs bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded font-medium">
                        {row.providerCount}
                      </span>
                    </TableCell>
                  )}
                  <TableCell className="py-2.5 font-medium tabular-nums">
                    {row.requests.toLocaleString()}
                  </TableCell>
                  <TableCell className="py-2.5 tabular-nums">
                    {row.errors > 0 ? (
                      <span className="text-red-500 font-medium">
                        {row.errors}{" "}
                        <span className="text-xs font-normal">({errorRate}%)</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2.5 tabular-nums text-muted-foreground">
                    {row.tokensIn.toLocaleString()}
                  </TableCell>
                  <TableCell className="pr-4 py-2.5 tabular-nums text-muted-foreground">
                    {row.tokensOut.toLocaleString()}
                  </TableCell>
                  <TableCell className="pr-4 py-2.5 text-xs text-muted-foreground">
                    {row.lastUsed
                      ? new Date(row.lastUsed).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
                      : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---- Main Page ----

export default function UsagePage() {
  const [filter, setFilter]   = useState("24h");
  const [usage,  setUsage]    = useState<UsageData | null>(null);
  const [logs,   setLogs]     = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const sseRef = useRef<EventSource | null>(null);
  const { tickColor, gridColor, mutedFg, primaryColor, cardBg, cardFg, borderColor } = useChartColors();

  // Client-side active provider tracking (real-time via SSE)
  const [activeProviderIds, setActiveProviderIds] = useState<Set<string>>(new Set());
  const activeTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const tooltipStyle = {
    backgroundColor: cardBg,
    border:          `1px solid ${borderColor}`,
    borderRadius:    8,
    fontSize:        13,
    color:           cardFg,
    boxShadow:       "0 4px 16px rgba(0,0,0,0.18)",
  };

  // Build provider ID → name map from usage data (canvasProviders + perProviderBreakdown)
  // This ensures even deleted/disabled providers show names in recent requests
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

  // Normalize model name: take part after last "/"
  const normalizeModel = (raw: string | null): string => {
    if (!raw) return "—";
    const idx = raw.lastIndexOf("/");
    const normalized = idx >= 0 ? raw.slice(idx + 1) : raw;
    return normalized || raw; // fallback to original if empty
  };

  async function fetchAll(f: string) {
    try {
      const [ur, lr] = await Promise.all([
        fetch(`/api/usage?filter=${f}`),
        fetch("/api/logs?limit=50"),
      ]);
      if (ur.ok) setUsage(await ur.json());
      if (lr.ok) {
        const lrData = await lr.json();
        setLogs(lrData.logs);
      }
    } catch { /* silent */ } finally { setLoading(false); }
  }

  useEffect(() => {
    let es: EventSource;
    let retries = 0;
    let reconnectTimeout: NodeJS.Timeout;

    function connectSSE() {
      es = new EventSource("/api/events");
      sseRef.current = es;

      es.onopen = () => {
        retries = 0; // Reset retries on successful connection
      };

      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "request-start") {
            // Mark provider as active immediately when a request starts
            const pid = msg.providerId as string;
            setActiveProviderIds((prev) => new Set(prev).add(pid));
            // Safety timeout: auto-remove after 60s if no completion event arrives
            const existing = activeTimeoutsRef.current.get(pid);
            if (existing) clearTimeout(existing);
            activeTimeoutsRef.current.set(pid, setTimeout(() => {
              setActiveProviderIds((prev) => {
                const next = new Set(prev);
                next.delete(pid);
                return next;
              });
              activeTimeoutsRef.current.delete(pid);
            }, 60000));
          }
          if (msg.type === "log") {
            // Request completed — remove provider from active set
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
            setLogs((p) => [msg.data as LogEntry, ...p].slice(0, 50));
            setFilter((cur) => { fetchAll(cur); return cur; });
          }
        } catch { /* ignore */ }
      };

      es.onerror = () => {
        es.close();
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
        const delay = Math.min(1000 * Math.pow(2, retries), 30000);
        retries++;
        reconnectTimeout = setTimeout(connectSSE, delay);
      };
    }

    connectSSE();

    return () => {
      clearTimeout(reconnectTimeout);
      es?.close();
      // Clean up all active provider timeouts
      for (const timeout of activeTimeoutsRef.current.values()) {
        clearTimeout(timeout);
      }
      activeTimeoutsRef.current.clear();
    };
  }, []);

  useEffect(() => { setLoading(true); fetchAll(filter); }, [filter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Zap className="h-6 w-6 text-muted-foreground animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading usage data…</p>
        </div>
      </div>
    );
  }

  const s = usage?.summary;
  const hasErrors = (s?.totalErrors ?? 0) > 0;
  const errorRate = s && s.totalRequests > 0
    ? `${((s.totalErrors / s.totalRequests) * 100).toFixed(1)}% error rate`
    : undefined;

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Usage</h2>
          <p className="text-muted-foreground mt-1">Real-time analytics and request history</p>
        </div>

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

      {/* ── Stat Cards ── */}
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
          value={s?.avgLatency ? `${s.avgLatency}ms` : "\u2014"}
          icon={Timer}
          variant={s?.avgLatency && s.avgLatency > 3000 ? "warning" : "default"}
          sublabel={s?.avgLatency && s.avgLatency > 3000 ? "above 3s threshold" : undefined}
        />
      </div>

      {/* ── Connection Map + Charts (2-col layout) ── */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Left: Connection Map */}
        <Card className="overflow-hidden flex flex-col">
          <SectionHeader
            title="Connection Map"
            trailing={
              <>
                <span className="font-medium text-foreground">{activeProviderIds.size}</span>
                {" active / "}
                {usage?.canvasProviders.length ?? 0} providers
              </>
            }
          />
          <CardContent className="p-0 flex-1 min-h-0">
            <div className="w-full h-full" style={{ minHeight: 380 }}>
              <ProviderCanvas
                providers={(usage?.canvasProviders ?? []).map((p) => ({
                  ...p,
                  active: activeProviderIds.has(p.id),
                }))}
                activeJobs={activeProviderIds.size > 0 ? activeProviderIds.size : (usage?.activeJobs ?? 0)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Right: 2 charts stacked */}
        <div className="flex flex-col gap-4">

          {/* Requests chart */}
          <Card>
            <SectionHeader title={usage?.hourly ? "Requests per Hour" : "Requests per Day"} />
            <CardContent className="pt-4 px-2 pb-3">
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={usage?.requestsPerPeriod ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis
                    dataKey={usage?.hourly ? "hour" : "date"}
                    tickFormatter={(v) => formatPeriodKey(v, usage?.hourly ?? false)}
                    tick={{ fontSize: 11, fill: tickColor }}
                    axisLine={false} tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: tickColor }}
                    axisLine={false} tickLine={false}
                    allowDecimals={false} width={28}
                  />
                  <Tooltip
                    labelFormatter={(v) => formatPeriodKey(v, usage?.hourly ?? false)}
                    contentStyle={tooltipStyle}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Line type="monotone" dataKey="requests" name="Requests" stroke={primaryColor} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: primaryColor }} />
                  <Line type="monotone" dataKey="errors"   name="Errors"   stroke={COLOR.errors}  strokeWidth={2} dot={false} activeDot={{ r: 4, fill: COLOR.errors }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Tokens chart */}
          <Card>
            <SectionHeader title={usage?.hourly ? "Token Usage per Hour" : "Token Usage per Day"} />
            <CardContent className="pt-4 px-2 pb-3">
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={usage?.tokenUsagePerPeriod ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis
                    dataKey={usage?.hourly ? "hour" : "date"}
                    tickFormatter={(v) => formatPeriodKey(v, usage?.hourly ?? false)}
                    tick={{ fontSize: 11, fill: tickColor }}
                    axisLine={false} tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: tickColor }}
                    axisLine={false} tickLine={false}
                    allowDecimals={false} width={36}
                  />
                  <Tooltip
                    labelFormatter={(v) => formatPeriodKey(v, usage?.hourly ?? false)}
                    contentStyle={tooltipStyle}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Line
                    type="monotone" dataKey="tokensIn"  name="Input"
                    stroke={primaryColor}  strokeWidth={2}
                    dot={false} activeDot={{ r: 4, fill: primaryColor }}
                  />
                  <Line
                    type="monotone" dataKey="tokensOut" name="Output"
                    stroke={mutedFg}        strokeWidth={2}
                    strokeDasharray="4 3"
                    dot={false} activeDot={{ r: 4, fill: mutedFg }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

        </div>
      </div>

      {/* ── Usage Breakdown (Provider / API Key / Model) ── */}
      {usage && (usage.perProviderBreakdown.length > 0 || usage.perApiKeyBreakdown.length > 0 || usage.perModelBreakdown?.length > 0) && (
        <BreakdownTable
          perProviderBreakdown={usage.perProviderBreakdown}
          perApiKeyBreakdown={usage.perApiKeyBreakdown}
          perModelBreakdown={usage.perModelBreakdown ?? []}
        />
      )}

      {/* ── Recent Requests ── */}
      <Card>
        <SectionHeader
          title="Recent Requests"
          trailing={`${logs.length} entries`}
        />
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16">
              <Activity className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No requests logged yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b">
                    <TableHead className="pl-4 text-xs font-semibold uppercase tracking-wide">Time</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide">Provider</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide">Model</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide">Status</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide">Latency</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide">Tokens In / Out</TableHead>
                    <TableHead className="pr-4 text-xs font-semibold uppercase tracking-wide">Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const { date, time } = formatTimestamp(log.timestamp);
                    const slowLatency = (log.latencyMs ?? 0) > 3000;
                    const providerName = log.providerId ? (providerMap[log.providerId] || log.providerId.slice(0, 8)) : "—";
                    return (
                      <TableRow key={log.id} className="group">
                        <TableCell className="pl-4 py-2.5">
                          <div className="text-sm font-medium">{date}</div>
                          <div className="text-xs text-muted-foreground">{time}</div>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <span className="text-xs text-muted-foreground">{providerName}</span>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground max-w-[180px] block truncate">
                            {normalizeModel(log.model)}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <StatusPill status={log.status} />
                        </TableCell>
                        <TableCell className="text-sm tabular-nums py-2.5">
                          {log.latencyMs ? (
                            <span className={slowLatency ? "text-amber-500 font-medium" : "text-muted-foreground"}>
                              {log.latencyMs}ms
                              {slowLatency && <span className="ml-1 text-xs">⚠</span>}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">\u2014</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums py-2.5">
                          {log.tokensIn || log.tokensOut ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="text-foreground font-medium">{(log.tokensIn ?? 0).toLocaleString()}</span>
                              <span className="text-border">/</span>
                              <span className="text-muted-foreground">{(log.tokensOut ?? 0).toLocaleString()}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">\u2014</span>
                          )}
                        </TableCell>
                        <TableCell className="pr-4 py-2.5 max-w-[200px]">
                          {log.error ? (
                            <span className="text-xs text-red-500 truncate block" title={log.error}>
                              {log.error}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}

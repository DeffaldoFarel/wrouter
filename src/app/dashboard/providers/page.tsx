"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import Link from "next/link";
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  KeyRound,
  Plus,
  Search,
  Server,
  Zap,
  AlertCircle,
  ExternalLink,
  Box,
} from "lucide-react";
import { KNOWN_API_KEY_PROVIDERS, type KnownApiKeyProvider } from "@/lib/constants/providers";
import { getProviderIcon } from "@/components/provider-icons";

interface Provider {
  id: string;
  name: string;
  prefix: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  enabled: boolean;
  type: string; // "custom" | "apikey"
  createdAt: string;
  updatedAt: string;
}

type HealthStatus = "unknown" | "checking" | "online" | "offline";

interface HealthResult {
  status: HealthStatus;
  latencyMs?: number;
  error?: string;
  checkedAt?: number;
}

// ─────────────────────────────────────────────
//  Brand Icon
// ─────────────────────────────────────────────

function BrandIcon({
  prefix,
  brandColor,
  label,
  size = "md",
}: {
  prefix?: string;
  brandColor?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: { box: "h-6 w-6", icon: "h-4 w-4", text: "text-[9px]" },
    md: { box: "h-8 w-8", icon: "h-5 w-5", text: "text-[10px]" },
    lg: { box: "h-10 w-10", icon: "h-6 w-6", text: "text-xs" },
  };

  // Try to get a real brand SVG icon by prefix
  const Icon = prefix ? getProviderIcon(prefix) : null;

  if (Icon) {
    return (
      <div
        className={`flex items-center justify-center rounded-md shrink-0 bg-muted/50 border ${sizes[size].box}`}
        style={brandColor ? { color: brandColor } : undefined}
      >
        <Icon className={sizes[size].icon} />
      </div>
    );
  }

  // Fallback: colored badge with label
  if (brandColor && label) {
    return (
      <div
        className={`flex items-center justify-center rounded-md shrink-0 font-bold text-white ${sizes[size].box} ${sizes[size].text}`}
        style={{ backgroundColor: brandColor }}
      >
        {label}
      </div>
    );
  }

  // Final fallback: generic Server icon
  return (
    <div
      className={`flex items-center justify-center rounded-md shrink-0 bg-muted ${sizes[size].box}`}
    >
      <Server
        className={`${size === "sm" ? "h-3 w-3" : "h-4 w-4"} text-muted-foreground`}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
//  Health Status Badge
// ─────────────────────────────────────────────

function HealthBadge({ health }: { health?: HealthResult }) {
  if (!health || health.status === "unknown") {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 h-5 px-1.5 text-muted-foreground">
        <Clock className="h-2.5 w-2.5" />
        Not checked
      </Badge>
    );
  }
  if (health.status === "checking") {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 h-5 px-1.5">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        Checking
      </Badge>
    );
  }
  if (health.status === "online") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] gap-1 h-5 px-1.5 text-green-700 border-green-300 bg-green-50 dark:text-green-400 dark:border-green-700 dark:bg-green-950/30"
      >
        <CheckCircle2 className="h-2.5 w-2.5" />
        {health.latencyMs ? `${health.latencyMs}ms` : "Online"}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="text-[10px] gap-1 h-5 px-1.5 text-red-700 border-red-300 bg-red-50 dark:text-red-400 dark:border-red-700 dark:bg-red-950/30"
      title={health.error || "Provider offline"}
    >
      <XCircle className="h-2.5 w-2.5" />
      Offline
    </Badge>
  );
}

// ─────────────────────────────────────────────
//  API Key Provider Card (known providers)
// ─────────────────────────────────────────────

function ApiKeyProviderSlot({
  known,
  connected,
  healthMap,
  onToggle,
  onCheckHealth,
}: {
  known: KnownApiKeyProvider;
  connected: Provider | null;
  healthMap: Record<string, HealthResult>;
  onToggle: (id: string, enabled: boolean) => void;
  onCheckHealth: (id: string) => void;
}) {
  const href = connected
    ? `/dashboard/providers/${connected.id}`
    : `/dashboard/providers/setup/${known.prefix}`;

  const health = connected ? healthMap[connected.id] : undefined;

  return (
    <Card
      className={`group transition-all hover:shadow-md hover:border-primary/40 ${
        !connected ? "border-dashed" : ""
      }`}
    >
      <CardContent className="space-y-3">
        {/* Header: brand icon + name + (toggle | not-set-up) */}
        <div className="flex items-start justify-between gap-2">
          <Link href={href} className="flex items-start gap-3 min-w-0 flex-1 hover:opacity-80 transition-opacity">
            <BrandIcon prefix={known.prefix} brandColor={known.brandColor} label={known.iconLabel} size="md" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm leading-tight truncate">{known.name}</p>
              <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                {known.prefix}/
              </p>
            </div>
          </Link>

          {/* Right side: Switch (when connected) or "Not set up" tag */}
          <div className="shrink-0">
            {connected ? (
              <Switch
                checked={connected.enabled}
                onCheckedChange={(checked) => onToggle(connected.id, checked)}
                className="scale-90"
              />
            ) : (
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                Not set up
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        <Link href={href} className="block hover:opacity-80 transition-opacity">
          <p className="text-xs text-muted-foreground leading-snug line-clamp-2">
            {known.description}
          </p>
        </Link>

        {/* Footer */}
        {connected ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <HealthBadge health={health} />
              <span className="text-[10px] text-muted-foreground">
                {connected.models.length} model{connected.models.length !== 1 ? "s" : ""}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCheckHealth(connected.id);
              }}
              className="h-6 px-2 text-[10px] rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex items-center gap-1"
              title="Check health"
              disabled={health?.status === "checking"}
            >
              <RefreshCw
                className={`h-3 w-3 ${health?.status === "checking" ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">Check</span>
            </button>
          </div>
        ) : (
          <Link href={href} className="flex items-center gap-1 text-[11px] text-primary hover:underline">
            <Plus className="h-3 w-3" />
            Connect now
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────
//  Custom Provider Card
// ─────────────────────────────────────────────

function ProviderCard({
  provider,
  healthMap,
  onToggle,
  onCheckHealth,
}: {
  provider: Provider;
  healthMap: Record<string, HealthResult>;
  onToggle: (id: string, enabled: boolean) => void;
  onCheckHealth: (id: string) => void;
}) {
  const health = healthMap[provider.id];

  return (
    <Card className="group transition-all hover:shadow-md hover:border-primary/40">
      <CardContent className="space-y-3">
        {/* Header: brand icon + name + toggle */}
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/dashboard/providers/${provider.id}`}
            className="flex items-start gap-3 min-w-0 flex-1 hover:opacity-80 transition-opacity"
          >
            <BrandIcon prefix={provider.prefix} size="md" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm leading-tight truncate">{provider.name}</p>
              <p className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
                {provider.prefix}/
              </p>
            </div>
          </Link>
          <div className="shrink-0">
            <Switch
              checked={provider.enabled}
              onCheckedChange={(checked) => onToggle(provider.id, checked)}
              className="scale-90"
            />
          </div>
        </div>

        {/* Base URL */}
        <Link
          href={`/dashboard/providers/${provider.id}`}
          className="block hover:opacity-80 transition-opacity"
        >
          <p className="text-[11px] text-muted-foreground font-mono leading-tight truncate">
            {provider.baseUrl}
          </p>
        </Link>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <HealthBadge health={health} />
            <span className="text-[10px] text-muted-foreground">
              {provider.models.length} model{provider.models.length !== 1 ? "s" : ""}
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCheckHealth(provider.id);
            }}
            className="h-6 px-2 text-[10px] rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex items-center gap-1"
            title="Check health"
            disabled={health?.status === "checking"}
          >
            <RefreshCw className={`h-3 w-3 ${health?.status === "checking" ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Check</span>
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────
//  Stat Card (overview)
// ─────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent = "default",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  hint?: string;
  accent?: "default" | "success" | "warning";
}) {
  const accentClass = {
    default: "text-foreground",
    success: "text-green-600 dark:text-green-400",
    warning: "text-amber-600 dark:text-amber-400",
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
//  Loading Skeleton
// ─────────────────────────────────────────────

function ProvidersSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-32 bg-muted rounded" />
          <div className="h-4 w-48 bg-muted rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-24 bg-muted rounded" />
          <div className="h-9 w-32 bg-muted rounded" />
        </div>
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 bg-muted rounded-lg" />
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-5 w-40 bg-muted rounded" />
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  Main Providers Page
// ─────────────────────────────────────────────

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [healthMap, setHealthMap] = useState<Record<string, HealthResult>>({});
  const [checkingAll, setCheckingAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Form state
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [format, setFormat] = useState<"openai" | "anthropic">("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch("/api/providers");
      if (res.ok) {
        const data = await res.json();
        setProviders(data);
      }
    } catch {
      toast.error("Failed to fetch providers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const checkHealth = useCallback(async (providerId: string) => {
    setHealthMap((prev) => ({
      ...prev,
      [providerId]: { status: "checking" },
    }));

    try {
      const res = await fetch(`/api/providers/${providerId}/health`);
      const data = await res.json();
      const result: HealthResult = {
        status: data.online ? "online" : "offline",
        latencyMs: data.latencyMs,
        error: data.error,
        checkedAt: Date.now(),
      };
      setHealthMap((prev) => ({ ...prev, [providerId]: result }));

      // Persist to localStorage
      try {
        const cache = JSON.parse(localStorage.getItem("wrouter:health-cache") || "{}");
        cache[providerId] = result;
        localStorage.setItem("wrouter:health-cache", JSON.stringify(cache));
      } catch {
        // ignore quota/parse errors
      }
    } catch {
      setHealthMap((prev) => ({
        ...prev,
        [providerId]: {
          status: "offline",
          error: "Connection failed",
          checkedAt: Date.now(),
        },
      }));
    }
  }, []);

  const checkAllHealth = useCallback(async () => {
    setCheckingAll(true);
    await Promise.all(providers.filter((p) => p.enabled).map((p) => checkHealth(p.id)));
    setCheckingAll(false);
    toast.success("Health check complete");
  }, [providers, checkHealth]);

  // Load cached health results from localStorage on mount
  // No automatic health check — user must click "Check All" or per-card "Check"
  // This avoids spamming provider /models endpoints on every page visit
  useEffect(() => {
    try {
      const cached = localStorage.getItem("wrouter:health-cache");
      if (cached) {
        const parsed: Record<string, HealthResult> = JSON.parse(cached);
        // Only keep results from the last 30 minutes (older = stale, treat as unknown)
        const FRESH_TTL = 30 * 60 * 1000;
        const now = Date.now();
        const fresh: Record<string, HealthResult> = {};
        for (const [id, result] of Object.entries(parsed)) {
          if (result.checkedAt && now - result.checkedAt < FRESH_TTL) {
            fresh[id] = result;
          }
        }
        if (Object.keys(fresh).length > 0) {
          setHealthMap(fresh);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  function resetForm() {
    setName("");
    setPrefix("");
    setFormat("openai");
    setBaseUrl("");
    setApiKey("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, prefix, baseUrl, apiKey, type: "custom", format }),
      });

      if (res.ok) {
        toast.success("Provider added");
        setDialogOpen(false);
        resetForm();
        fetchProviders();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to add provider");
      }
    } catch {
      toast.error("Connection error");
    }
  }

  async function toggleProvider(id: string, enabled: boolean) {
    try {
      const res = await fetch(`/api/providers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        setProviders((prev) =>
          prev.map((p) => (p.id === id ? { ...p, enabled } : p))
        );
        toast.success(enabled ? "Provider enabled" : "Provider disabled");
      } else {
        toast.error("Failed to update provider");
      }
    } catch {
      toast.error("Failed to update provider");
    }
  }

  // ─── Derived data ───
  const customProviders = useMemo(
    () => providers.filter((p) => p.type !== "apikey"),
    [providers]
  );

  const totalActive = providers.filter((p) => p.enabled).length;
  const totalModels = providers.reduce((sum, p) => sum + p.models.length, 0);

  const healthStats = useMemo(() => {
    const enabled = providers.filter((p) => p.enabled);
    let online = 0;
    let offline = 0;
    enabled.forEach((p) => {
      const h = healthMap[p.id];
      if (h?.status === "online") online++;
      else if (h?.status === "offline") offline++;
    });
    return { online, offline };
  }, [providers, healthMap]);

  // Filter known providers by search
  const filteredKnown = useMemo(() => {
    if (!searchQuery.trim()) return KNOWN_API_KEY_PROVIDERS;
    const q = searchQuery.toLowerCase();
    return KNOWN_API_KEY_PROVIDERS.filter(
      (k) =>
        k.name.toLowerCase().includes(q) ||
        k.prefix.toLowerCase().includes(q) ||
        k.description.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // Filter custom providers by search
  const filteredCustom = useMemo(() => {
    if (!searchQuery.trim()) return customProviders;
    const q = searchQuery.toLowerCase();
    return customProviders.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.prefix.toLowerCase().includes(q) ||
        p.baseUrl.toLowerCase().includes(q)
    );
  }, [customProviders, searchQuery]);

  if (loading) return <ProvidersSkeleton />;

  return (
    <div className="space-y-6">
      {/* ═══ Header ═══ */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Providers</h2>
          <p className="text-muted-foreground mt-1">
            Manage AI API providers and their connections
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalActive > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={checkAllHealth}
              disabled={checkingAll}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${checkingAll ? "animate-spin" : ""}`} />
              {checkingAll ? "Checking..." : "Check All"}
            </Button>
          )}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger
              render={
                <Button
                  onClick={() => {
                    resetForm();
                    setDialogOpen(true);
                  }}
                />
              }
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Custom Provider
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Custom Provider</DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Connect any OpenAI-compatible endpoint
                </p>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g. Groq, Together AI, Local LLM"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prefix">Prefix</Label>
                  <Input
                    id="prefix"
                    placeholder="e.g. groq, together, local"
                    value={prefix}
                    onChange={(e) =>
                      setPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
                    }
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Used to call models:{" "}
                    <code className="bg-muted px-1 py-0.5 rounded">
                      {prefix || "prefix"}/model-name
                    </code>
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="baseUrl">Base URL</Label>
                  <Input
                    id="baseUrl"
                    placeholder="https://api.example.com/v1"
                    value={baseUrl}
                    onChange={(e) => {
                      const v = e.target.value;
                      setBaseUrl(v);
                      // Auto-detect format from URL
                      if (v.includes("anthropic.com")) setFormat("anthropic");
                      else if (v.length > 0 && format === "anthropic" && !v.includes("anthropic.com")) {
                        setFormat("openai");
                      }
                    }}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="format">API Format</Label>
                  <select
                    id="format"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                    value={format}
                    onChange={(e) => setFormat(e.target.value as "openai" | "anthropic")}
                  >
                    <option value="openai">OpenAI-compatible (default)</option>
                    <option value="anthropic">Anthropic native (/v1/messages)</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {format === "anthropic"
                      ? "Provider speaks Anthropic /v1/messages with x-api-key header. WRouter translates OpenAI ⇄ Anthropic transparently."
                      : "Standard /v1/chat/completions with Bearer auth (OpenAI, DeepSeek, Genflow, OpenRouter, etc.)"}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apiKey">API Key</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    placeholder="sk-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    required
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Add Provider</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ═══ Stats Overview ═══ */}
      {providers.length > 0 && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Server}
            label="Total Providers"
            value={providers.length}
            hint={`${totalActive} active`}
          />
          <StatCard
            icon={CheckCircle2}
            label="Healthy"
            value={healthStats.online}
            hint={
              healthStats.online + healthStats.offline === 0
                ? "Run health check"
                : `of ${healthStats.online + healthStats.offline} checked`
            }
            accent="success"
          />
          <StatCard
            icon={AlertCircle}
            label="Issues"
            value={healthStats.offline}
            hint={healthStats.offline === 0 ? "All systems good" : "Need attention"}
            accent={healthStats.offline > 0 ? "warning" : "default"}
          />
          <StatCard
            icon={Box}
            label="Total Models"
            value={totalModels}
            hint="Across all providers"
          />
        </div>
      )}

      {/* ═══ Search Bar ═══ */}
      {providers.length > 0 && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search providers by name, prefix, or URL..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <XCircle className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* ═══ API Key Providers ═══ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">API Key Providers</h3>
            <Badge variant="secondary" className="text-[10px]">
              {KNOWN_API_KEY_PROVIDERS.length} available
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Aggregators with their own model catalog
          </p>
        </div>
        {filteredKnown.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6 border rounded-md border-dashed">
            No providers match &quot;{searchQuery}&quot;
          </p>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {filteredKnown.map((known) => {
              const connected =
                providers.find((p) => p.name === known.name && p.type === "apikey") ?? null;
              return (
                <ApiKeyProviderSlot
                  key={known.prefix}
                  known={known}
                  connected={connected}
                  healthMap={healthMap}
                  onToggle={toggleProvider}
                  onCheckHealth={checkHealth}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ Custom Providers ═══ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Custom Providers</h3>
            {customProviders.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {customProviders.length}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Direct OpenAI-compatible endpoints
          </p>
        </div>

        {customProviders.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="py-8 text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Plus className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">No custom providers yet</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Add any OpenAI-compatible endpoint like Groq, Together AI, or your own
                  local LLM server.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  resetForm();
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Custom Provider
              </Button>
            </CardContent>
          </Card>
        ) : filteredCustom.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6 border rounded-md border-dashed">
            No providers match &quot;{searchQuery}&quot;
          </p>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCustom.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                healthMap={healthMap}
                onToggle={toggleProvider}
                onCheckHealth={checkHealth}
              />
            ))}
          </div>
        )}
      </div>

      {/* ═══ Help Footer ═══ */}
      <div className="border-t pt-4 mt-8">
        <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-muted-foreground">
          <p>
            Need a provider that&apos;s not listed?{" "}
            <button
              onClick={() => {
                resetForm();
                setDialogOpen(true);
              }}
              className="text-primary hover:underline"
            >
              Add a custom provider
            </button>
          </p>
          <a
            href="https://github.com/your-org/wrouter"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            View documentation
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  Activity,
  Eye,
  EyeOff,
  Copy,
  RefreshCw,
  Server,
  Box,
  Settings,
  AlertCircle,
  Search,
  Plus,
  Download,
  Zap,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
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

type HealthStatus = "idle" | "testing" | "healthy" | "unhealthy";

interface ModelHealth {
  status: HealthStatus;
  latencyMs?: number;
  error?: string;
}

type ProviderHealth =
  | { status: "unknown" }
  | { status: "checking" }
  | { status: "online"; latencyMs: number; checkedAt: number }
  | { status: "offline"; error?: string; checkedAt: number };

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

function maskApiKey(key: string): string {
  if (!key || key.length < 8) return "••••••••";
  return key.slice(0, 4) + "•".repeat(Math.min(20, key.length - 8)) + key.slice(-4);
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

// ─────────────────────────────────────────────
//  Provider Health Badge
// ─────────────────────────────────────────────

function ProviderHealthIndicator({
  health,
  onCheck,
}: {
  health: ProviderHealth;
  onCheck: () => void;
}) {
  const config = {
    unknown: {
      label: "Not checked",
      className: "text-muted-foreground bg-muted",
      icon: AlertCircle,
    },
    checking: {
      label: "Checking...",
      className: "text-blue-600 bg-blue-50 dark:bg-blue-950/30",
      icon: Loader2,
    },
    online: {
      label: "Online",
      className:
        "text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-950/30",
      icon: CheckCircle2,
    },
    offline: {
      label: "Offline",
      className:
        "text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-950/30",
      icon: XCircle,
    },
  }[health.status];

  const Icon = config.icon;
  const checkedAt =
    health.status === "online" || health.status === "offline"
      ? health.checkedAt
      : null;

  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${config.className}`}>
        <Icon className={`h-3.5 w-3.5 ${health.status === "checking" ? "animate-spin" : ""}`} />
        <span className="text-xs font-medium">
          {health.status === "online" && "latencyMs" in health
            ? `${config.label} (${health.latencyMs}ms)`
            : config.label}
        </span>
      </div>
      {checkedAt && (
        <span className="text-[10px] text-muted-foreground">
          {formatRelativeTime(checkedAt)}
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2"
        onClick={onCheck}
        disabled={health.status === "checking"}
      >
        <RefreshCw
          className={`h-3 w-3 ${health.status === "checking" ? "animate-spin" : ""}`}
        />
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────
//  Stat Card
// ─────────────────────────────────────────────

function StatItem({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-md bg-muted p-2 shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
          {label}
        </p>
        <p className="text-lg font-bold tabular-nums leading-tight">{value}</p>
        {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  Loading Skeleton
// ─────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-4 w-48 bg-muted rounded" />
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 bg-muted rounded-lg" />
        <div className="space-y-2 flex-1">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-4 w-32 bg-muted rounded" />
        </div>
      </div>
      <div className="grid gap-3 grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 bg-muted rounded-lg" />
        ))}
      </div>
      <div className="h-64 bg-muted rounded-lg" />
      <div className="h-96 bg-muted rounded-lg" />
    </div>
  );
}

// ─────────────────────────────────────────────
//  Main Provider Detail Page
// ─────────────────────────────────────────────

export default function ProviderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // Edit form state
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [modelList, setModelList] = useState<string[]>([]);
  const [newModel, setNewModel] = useState("");
  const [modelSearch, setModelSearch] = useState("");

  // Health check
  const [providerHealth, setProviderHealth] = useState<ProviderHealth>({
    status: "unknown",
  });
  const [modelHealth, setModelHealth] = useState<Record<string, ModelHealth>>({});
  const [testingAll, setTestingAll] = useState(false);

  // Stats from usage API
  const [stats, setStats] = useState<{
    requests: number;
    errors: number;
    avgLatency: number;
    tokensIn: number;
    tokensOut: number;
  } | null>(null);

  const fetchProvider = useCallback(async () => {
    try {
      const res = await fetch(`/api/providers/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setProvider(data);
        setName(data.name);
        setPrefix(data.prefix);
        setBaseUrl(data.baseUrl);
        setModelList(data.models);
      } else {
        toast.error("Provider not found");
        router.push("/dashboard/providers");
      }
    } catch {
      toast.error("Failed to fetch provider");
    } finally {
      setLoading(false);
    }
  }, [params.id, router]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/usage?filter=today");
      if (res.ok) {
        const data = await res.json();
        const breakdown = data.perProviderBreakdown?.find(
          (p: { providerId: string }) => p.providerId === params.id
        );
        if (breakdown) {
          setStats({
            requests: breakdown.requests || 0,
            errors: breakdown.errors || 0,
            avgLatency: data.summary?.avgLatency || 0,
            tokensIn: breakdown.tokensIn || 0,
            tokensOut: breakdown.tokensOut || 0,
          });
        } else {
          setStats({
            requests: 0,
            errors: 0,
            avgLatency: 0,
            tokensIn: 0,
            tokensOut: 0,
          });
        }
      }
    } catch {
      // silent
    }
  }, [params.id]);

  const checkProviderHealth = useCallback(async () => {
    setProviderHealth({ status: "checking" });
    try {
      const res = await fetch(`/api/providers/${params.id}/health`);
      const data = await res.json();
      const result: ProviderHealth = data.online
        ? {
            status: "online",
            latencyMs: data.latencyMs,
            checkedAt: Date.now(),
          }
        : {
            status: "offline",
            error: data.error,
            checkedAt: Date.now(),
          };
      setProviderHealth(result);

      // Persist to shared health cache (so list page can pick it up too)
      try {
        const cache = JSON.parse(localStorage.getItem("wrouter:health-cache") || "{}");
        cache[params.id as string] = {
          status: result.status,
          latencyMs: "latencyMs" in result ? result.latencyMs : undefined,
          error: "error" in result ? result.error : undefined,
          checkedAt: "checkedAt" in result ? result.checkedAt : Date.now(),
        };
        localStorage.setItem("wrouter:health-cache", JSON.stringify(cache));
      } catch {
        // ignore
      }
    } catch {
      setProviderHealth({
        status: "offline",
        error: "Connection failed",
        checkedAt: Date.now(),
      });
    }
  }, [params.id]);

  useEffect(() => {
    fetchProvider();
    fetchStats();
  }, [fetchProvider, fetchStats]);

  // Load cached health from localStorage instead of auto-checking
  // User must manually click "Refresh" to perform a real check
  useEffect(() => {
    if (!provider) return;
    try {
      const cached = localStorage.getItem("wrouter:health-cache");
      if (cached) {
        const parsed = JSON.parse(cached);
        const entry = parsed[params.id as string];
        const FRESH_TTL = 30 * 60 * 1000;
        if (entry?.checkedAt && Date.now() - entry.checkedAt < FRESH_TTL) {
          if (entry.status === "online") {
            setProviderHealth({
              status: "online",
              latencyMs: entry.latencyMs || 0,
              checkedAt: entry.checkedAt,
            });
          } else if (entry.status === "offline") {
            setProviderHealth({
              status: "offline",
              error: entry.error,
              checkedAt: entry.checkedAt,
            });
          }
        }
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  function addModel() {
    const trimmed = newModel.trim();
    if (!trimmed) {
      toast.error("Model name cannot be empty");
      return;
    }
    if (modelList.includes(trimmed)) {
      toast.error("Model already exists");
      return;
    }
    setModelList([...modelList, trimmed]);
    setNewModel("");
    toast.success("Model added (remember to save)");
  }

  function removeModel(model: string) {
    setModelList(modelList.filter((m) => m !== model));
  }

  const hasChanges =
    name !== (provider?.name ?? "") ||
    prefix !== (provider?.prefix ?? "") ||
    (provider?.type !== "apikey" && baseUrl !== (provider?.baseUrl ?? "")) ||
    apiKey !== "" ||
    JSON.stringify(modelList) !== JSON.stringify(provider?.models ?? []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      name,
      prefix,
      baseUrl,
      models: modelList,
    };
    if (apiKey) payload.apiKey = apiKey;

    try {
      const res = await fetch(`/api/providers/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Provider updated");
        setApiKey("");
        fetchProvider();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update provider");
      }
    } catch {
      toast.error("Connection error");
    }
  }

  async function handleFetchModels() {
    if (!baseUrl) {
      toast.error("Base URL is required to fetch models");
      return;
    }
    setFetchingModels(true);
    try {
      const res = await fetch("/api/providers/fetch-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl,
          apiKey: apiKey || undefined,
          providerId: params.id,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.models && data.models.length > 0) {
          setModelList(data.models);
          toast.success(`Fetched ${data.models.length} models`);
        } else {
          toast.error("No models found");
        }
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to fetch models");
      }
    } catch {
      toast.error("Failed to fetch models");
    } finally {
      setFetchingModels(false);
    }
  }

  async function toggleProvider(enabled: boolean) {
    try {
      await fetch(`/api/providers/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      toast.success(enabled ? "Provider enabled" : "Provider disabled");
      fetchProvider();
    } catch {
      toast.error("Failed to update provider");
    }
  }

  async function deleteProvider() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/providers/${params.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Provider deleted");
        router.push("/dashboard/providers");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete provider");
        setDeleteConfirmOpen(false);
      }
    } catch {
      toast.error("Connection error");
    } finally {
      setDeleting(false);
    }
  }

  async function testModel(model: string) {
    setModelHealth((prev) => ({ ...prev, [model]: { status: "testing" } }));
    try {
      const res = await fetch(`/api/providers/${params.id}/test-model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      const data = await res.json();
      if (data.success) {
        setModelHealth((prev) => ({
          ...prev,
          [model]: { status: "healthy", latencyMs: data.latencyMs },
        }));
      } else {
        setModelHealth((prev) => ({
          ...prev,
          [model]: { status: "unhealthy", latencyMs: data.latencyMs, error: data.error },
        }));
      }
    } catch {
      setModelHealth((prev) => ({
        ...prev,
        [model]: { status: "unhealthy", error: "Connection failed" },
      }));
    }
  }

  async function testAllModels() {
    setTestingAll(true);
    setModelHealth({});
    for (const model of modelList) {
      await testModel(model);
    }
    setTestingAll(false);
    toast.success("Test complete");
  }

  // ─── Filtered models by search ───
  const filteredModels = useMemo(() => {
    if (!modelSearch.trim()) return modelList;
    const q = modelSearch.toLowerCase();
    return modelList.filter((m) => m.toLowerCase().includes(q));
  }, [modelList, modelSearch]);

  // ─── Model health stats ───
  const modelHealthStats = useMemo(() => {
    let healthy = 0;
    let unhealthy = 0;
    Object.values(modelHealth).forEach((h) => {
      if (h.status === "healthy") healthy++;
      else if (h.status === "unhealthy") unhealthy++;
    });
    return { healthy, unhealthy, tested: healthy + unhealthy };
  }, [modelHealth]);

  if (loading) return <DetailSkeleton />;
  if (!provider) return null;

  return (
    <div className="space-y-6">
      {/* ═══ Breadcrumbs ═══ */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link
          href="/dashboard"
          className="hover:text-foreground transition-colors"
        >
          Dashboard
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link
          href="/dashboard/providers"
          className="hover:text-foreground transition-colors"
        >
          Providers
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">{provider.name}</span>
      </nav>

      {/* ═══ Header ═══ */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-start gap-4">
          <Link href="/dashboard/providers">
            <Button variant="ghost" size="sm" className="mt-1">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-start gap-3">
            {(() => {
              const Icon = provider ? getProviderIcon(provider.prefix) : null;
              if (Icon) {
                return (
                  <div className="h-12 w-12 rounded-lg bg-muted/50 border flex items-center justify-center shrink-0">
                    <Icon className="h-7 w-7" />
                  </div>
                );
              }
              return (
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Server className="h-6 w-6 text-primary" />
                </div>
              );
            })()}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight">{provider.name}</h1>
                <Badge variant={provider.enabled ? "default" : "secondary"}>
                  {provider.enabled ? "Active" : "Disabled"}
                </Badge>
                {provider.type === "apikey" && (
                  <Badge variant="outline" className="text-[10px]">
                    API Key Provider
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1 font-mono">
                {provider.prefix}/<span className="opacity-60">model-name</span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ProviderHealthIndicator
            health={providerHealth}
            onCheck={checkProviderHealth}
          />
          <Switch
            checked={provider.enabled}
            onCheckedChange={toggleProvider}
          />
          <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
            <DialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                />
              }
            >
              <Trash2 className="h-4 w-4" />
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Provider</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete{" "}
                  <strong className="text-foreground">{provider.name}</strong>? This
                  action cannot be undone and will remove all associated models and
                  configurations.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteConfirmOpen(false)}
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button variant="destructive" onClick={deleteProvider} disabled={deleting}>
                  {deleting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    "Delete Provider"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ═══ Stats Overview ═══ */}
      <Card>
        <CardContent>
          <div className="grid gap-6 grid-cols-2 md:grid-cols-4">
            <StatItem
              icon={Activity}
              label="Requests Today"
              value={stats?.requests ?? 0}
              hint={
                stats && stats.errors > 0
                  ? `${stats.errors} errors`
                  : "No errors"
              }
            />
            <StatItem
              icon={Zap}
              label="Avg Latency"
              value={stats?.avgLatency ? `${stats.avgLatency}ms` : "—"}
              hint="System-wide"
            />
            <StatItem
              icon={Box}
              label="Models"
              value={modelList.length}
              hint={
                modelHealthStats.tested > 0
                  ? `${modelHealthStats.healthy}/${modelHealthStats.tested} healthy`
                  : "Not tested"
              }
            />
            <StatItem
              icon={Settings}
              label="Tokens In/Out"
              value={
                stats
                  ? `${(stats.tokensIn / 1000).toFixed(1)}K / ${(stats.tokensOut / 1000).toFixed(1)}K`
                  : "0 / 0"
              }
              hint="Today"
            />
          </div>
        </CardContent>
      </Card>

      {/* ═══ Form ═══ */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* Provider Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Provider Settings
              </CardTitle>
              {hasChanges && (
                <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                  Unsaved changes
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Display Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prefix">Prefix</Label>
                <Input
                  id="prefix"
                  value={prefix}
                  onChange={(e) =>
                    setPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
                  }
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Used to call models:{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">{prefix}/model-name</code>
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="baseUrl">Base URL</Label>
              {provider.type === "apikey" ? (
                <div className="flex items-center gap-2">
                  <Input
                    id="baseUrl"
                    value={baseUrl}
                    disabled
                    className="font-mono text-sm text-muted-foreground bg-muted"
                  />
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    Preconfigured
                  </Badge>
                </div>
              ) : (
                <Input
                  id="baseUrl"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  required
                  className="font-mono text-sm"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiKey" className="flex items-center justify-between">
                <span>API Key</span>
                <span className="text-xs text-muted-foreground font-normal">
                  Leave empty to keep current
                </span>
              </Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  placeholder={`Current: ${maskApiKey(provider.apiKey)}`}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Models */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Box className="h-4 w-4" />
                  Models
                  <Badge variant="secondary" className="text-[10px]">
                    {modelList.length}
                  </Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Use{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">
                    {prefix}/model-name
                  </code>{" "}
                  to route requests
                </p>
              </div>
              <div className="flex items-center gap-2">
                {modelList.length > 0 && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={testingAll}
                      onClick={testAllModels}
                    >
                      {testingAll ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          Testing {modelHealthStats.tested}/{modelList.length}
                        </>
                      ) : (
                        <>
                          <Activity className="h-3.5 w-3.5 mr-1" />
                          Test All
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if (confirm("Are you sure you want to delete all models?")) {
                          setModelList([]);
                          setModelHealth({});
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Clear All
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={fetchingModels}
                  onClick={handleFetchModels}
                >
                  {fetchingModels ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      Fetching...
                    </>
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5 mr-1" />
                      Fetch Models
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add model + Search */}
            <div className="grid gap-2 md:grid-cols-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Add model (e.g. gpt-4o)"
                  value={newModel}
                  onChange={(e) => setNewModel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addModel();
                    }
                  }}
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addModel}
                  className="shrink-0"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
              {modelList.length > 5 && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search models..."
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    className="pl-9 font-mono text-sm"
                  />
                </div>
              )}
            </div>

            {/* Model health summary */}
            {modelHealthStats.tested > 0 && (
              <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-muted/50 text-xs">
                <span className="flex items-center gap-1 text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-3 w-3" />
                  {modelHealthStats.healthy} healthy
                </span>
                {modelHealthStats.unhealthy > 0 && (
                  <span className="flex items-center gap-1 text-red-700 dark:text-red-400">
                    <XCircle className="h-3 w-3" />
                    {modelHealthStats.unhealthy} failed
                  </span>
                )}
                <span className="text-muted-foreground ml-auto">
                  {modelHealthStats.tested} of {modelList.length} tested
                </span>
              </div>
            )}

            {/* Model list */}
            {modelList.length > 0 ? (
              filteredModels.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center border rounded-md border-dashed">
                  No models match &quot;{modelSearch}&quot;
                </p>
              ) : (
                <div className="grid gap-2">
                  {filteredModels.map((model) => {
                    const fullModelId = `${prefix}/${model}`;
                    const health = modelHealth[model];
                    return (
                      <div
                        key={model}
                        className={`rounded-md border px-4 py-3 transition-colors ${
                          health?.status === "healthy"
                            ? "border-green-300 dark:border-green-800 bg-green-50/30 dark:bg-green-950/10"
                            : health?.status === "unhealthy"
                            ? "border-red-300 dark:border-red-800 bg-red-50/30 dark:bg-red-950/10"
                            : ""
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium font-mono">
                                {model}
                              </span>
                              {health?.status === "healthy" && (
                                <Badge
                                  variant="outline"
                                  className="text-green-600 border-green-300 dark:text-green-400 dark:border-green-700 text-[10px] px-1.5 py-0 h-4"
                                >
                                  <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                                  {health.latencyMs}ms
                                </Badge>
                              )}
                              {health?.status === "unhealthy" && (
                                <Badge
                                  variant="outline"
                                  className="text-red-600 border-red-300 dark:text-red-400 dark:border-red-700 text-[10px] px-1.5 py-0 h-4"
                                >
                                  <XCircle className="h-2.5 w-2.5 mr-0.5" />
                                  Failed
                                </Badge>
                              )}
                              {health?.status === "testing" && (
                                <Badge
                                  variant="outline"
                                  className="text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-700 text-[10px] px-1.5 py-0 h-4"
                                >
                                  <Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin" />
                                  Testing
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <code className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono select-all">
                                {fullModelId}
                              </code>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  navigator.clipboard.writeText(fullModelId);
                                  toast.success("Copied");
                                }}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                            {health?.status === "unhealthy" && health.error && (
                              <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">
                                {health.error}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={health?.status === "testing"}
                              onClick={() => testModel(model)}
                            >
                              {health?.status === "testing" ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <>
                                  <Activity className="h-3.5 w-3.5 mr-1" />
                                  Test
                                </>
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive h-7 w-7 p-0"
                              onClick={() => {
                                removeModel(model);
                                setModelHealth((prev) => {
                                  const next = { ...prev };
                                  delete next[model];
                                  return next;
                                });
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="py-12 text-center border-2 border-dashed rounded-md space-y-2">
                <Box className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm font-medium">No models added yet</p>
                <p className="text-xs text-muted-foreground">
                  Add manually or use{" "}
                  <button
                    type="button"
                    onClick={handleFetchModels}
                    className="text-primary hover:underline"
                  >
                    Fetch Models
                  </button>{" "}
                  to auto-discover
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Save bar */}
        {hasChanges && (
          <div className="sticky bottom-4 flex items-center justify-between gap-3 p-3 bg-background border-2 border-primary/30 rounded-lg shadow-lg z-10">
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <span className="font-medium">You have unsaved changes</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (provider) {
                    setName(provider.name);
                    setPrefix(provider.prefix);
                    setBaseUrl(provider.baseUrl);
                    setApiKey("");
                    setModelList(provider.models);
                  }
                }}
              >
                Discard
              </Button>
              <Button type="submit" size="sm">
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

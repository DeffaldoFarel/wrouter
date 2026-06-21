"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Pencil,
  Eye,
  EyeOff,
  Copy,
  Check,
  Server,
  Key,
  Layers,
  Activity,
  Zap,
  Sparkles,
  ArrowUpRight,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import {
  RTK_DESCRIPTION_SHORT,
  CAVEMAN_DESCRIPTION_SHORT,
} from "@/lib/constants/token-saver-copy";

interface ApiKey {
  id: string;
  name: string;
  key: string;
  enabled: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  allowedModels: string[];
}

interface Provider {
  id: string;
  name: string;
  prefix: string;
  models: string[];
  enabled: boolean;
}

interface Combo {
  id: string;
  name: string;
  slug: string;
  enabled: boolean;
}

interface UsageSummary {
  totalRequests: number;
  totalErrors: number;
  totalTokensIn: number;
  totalTokensOut: number;
  avgLatency: number;
}

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

function maskApiKey(key: string): string {
  if (!key || key.length < 12) return key;
  const prefix = key.slice(0, 7); // "wkz-xxx"
  const suffix = key.slice(-4);
  return `${prefix}${"•".repeat(12)}${suffix}`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ─────────────────────────────────────────────
//  Stats Card Component
// ─────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  href,
  accent = "default",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  accent?: "default" | "success" | "warning" | "info";
}) {
  const accentClass = {
    default: "text-foreground",
    success: "text-green-600 dark:text-green-400",
    warning: "text-amber-600 dark:text-amber-400",
    info: "text-blue-600 dark:text-blue-400",
  }[accent];

  const content = (
    <Card className="transition-all hover:shadow-md hover:border-primary/40">
      <CardContent>
        <div className="flex items-start justify-between">
          <div className="space-y-1.5 flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {label}
            </p>
            <p className={`text-2xl font-bold tabular-nums ${accentClass}`}>{value}</p>
            {hint && <p className="text-xs text-muted-foreground truncate">{hint}</p>}
          </div>
          <div className={`rounded-md bg-muted p-2 ${accentClass}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block group">
        {content}
      </Link>
    );
  }
  return content;
}

// ─────────────────────────────────────────────
//  Code Block with Copy
// ─────────────────────────────────────────────

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      {label && (
        <div className="absolute top-2 left-3 text-[10px] uppercase tracking-wide text-muted-foreground/70 font-mono">
          {label}
        </div>
      )}
      <pre className={`rounded-md bg-muted p-4 ${label ? "pt-7" : ""} text-xs font-mono overflow-x-auto border`}>
        {code}
      </pre>
      <Button
        size="sm"
        variant="ghost"
        onClick={handleCopy}
        className="absolute top-2 right-2 h-7 px-2 opacity-70 group-hover:opacity-100 transition-opacity"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 mr-1 text-green-500" />
            Copied
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5 mr-1" />
            Copy
          </>
        )}
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────
//  Loading Skeleton
// ─────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="h-4 w-64 bg-muted rounded" />
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-muted rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-48 bg-muted rounded-lg" />
        <div className="h-48 bg-muted rounded-lg" />
      </div>
      <div className="h-64 bg-muted rounded-lg" />
    </div>
  );
}

// ─────────────────────────────────────────────
//  Main Dashboard
// ─────────────────────────────────────────────

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [editKeyDialogOpen, setEditKeyDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
  const [selectedKeyId, setSelectedKeyId] = useState<string>("");
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [deleteApiKeyTarget, setDeleteApiKeyTarget] = useState<ApiKey | null>(null);

  useEffect(() => {
    fetchAll();
    // Refresh usage stats every 30 seconds
    const interval = setInterval(fetchUsage, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchUsage() {
    try {
      const res = await fetch("/api/usage?filter=today");
      if (res.ok) {
        const data = await res.json();
        if (data.summary) setUsage(data.summary);
      }
    } catch {
      // silent
    }
  }

  async function fetchAll() {
    try {
      const [settingsData, keysData, providersData, combosData, usageData] =
        await Promise.all([
          fetch("/api/settings").then((r) => r.json()),
          fetch("/api/keys").then((r) => r.json()),
          fetch("/api/providers").then((r) => r.json()),
          fetch("/api/combos").then((r) => r.json()),
          fetch("/api/usage?filter=today").then((r) => r.json()),
        ]);

      if (settingsData && typeof settingsData === "object") {
        setSettings(settingsData);
      }
      if (Array.isArray(keysData)) {
        setApiKeys(keysData);
        const firstEnabled = keysData.find((k: ApiKey) => k.enabled);
        if (firstEnabled && !selectedKeyId) {
          setSelectedKeyId(firstEnabled.id);
        }
      }
      if (Array.isArray(providersData)) setProviders(providersData);
      if (Array.isArray(combosData)) setCombos(combosData);
      if (usageData?.summary) setUsage(usageData.summary);
    } catch {
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }

  async function toggleSetting(key: string, enabled: boolean) {
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: enabled ? "true" : "false" }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, [key]: enabled ? "true" : "false" }));
        toast.success(`${enabled ? "Enabled" : "Disabled"} successfully`);
      }
    } catch {
      toast.error("Failed to update setting");
    }
  }

  async function createApiKey(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) {
      toast.error("Key name is required");
      return;
    }
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      });
      if (res.ok) {
        toast.success("API key created");
        setNewKeyName("");
        fetchAll();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create API key");
      }
    } catch {
      toast.error("Connection error");
    }
  }

  async function toggleApiKey(id: string, enabled: boolean) {
    try {
      const res = await fetch(`/api/keys/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to update API key");
        return;
      }
      toast.success(enabled ? "API key enabled" : "API key disabled");
      fetchAll();
    } catch {
      toast.error("Failed to update API key");
    }
  }

  async function deleteApiKey(id: string) {
    try {
      const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("API key deleted");
        fetchAll();
      }
    } catch {
      toast.error("Failed to delete API key");
    }
  }

  async function confirmDeleteApiKey() {
    if (!deleteApiKeyTarget) return;
    const id = deleteApiKeyTarget.id;
    setDeleteApiKeyTarget(null);
    await deleteApiKey(id);
  }

  function toggleReveal(id: string) {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openEditDialog(key: ApiKey) {
    let allowedModels: string[] = [];
    if (Array.isArray(key.allowedModels)) {
      allowedModels = key.allowedModels.filter(
        (m) => typeof m === "string" && m !== "[" && m !== "]" && m !== "{" && m !== "}"
      );
    }
    if (allowedModels.length === 0) {
      const allModels = providers
        .filter((p) => p.enabled)
        .flatMap((p) => p.models.map((m) => p.prefix + "/" + m));
      const allCombos = combos.filter((c) => c.enabled).map((c) => c.slug);
      allowedModels = [...allModels, ...allCombos];
    }
    setEditingKey({ ...key, allowedModels });
    setEditKeyDialogOpen(true);
  }

  function addModelToSelection(model: string) {
    if (!editingKey) return;
    if (!editingKey.allowedModels.includes(model)) {
      setEditingKey({
        ...editingKey,
        allowedModels: [...editingKey.allowedModels, model],
      });
    }
  }

  function removeModel(model: string) {
    if (!editingKey) return;
    setEditingKey({
      ...editingKey,
      allowedModels: editingKey.allowedModels.filter((m) => m !== model),
    });
  }

  async function saveAllowedModels() {
    if (!editingKey) return;
    try {
      const allModels = providers
        .filter((p) => p.enabled)
        .flatMap((p) => p.models.map((m) => p.prefix + "/" + m));
      const allComboSlugs = combos.filter((c) => c.enabled).map((c) => c.slug);
      const totalAvailable = allModels.length + allComboSlugs.length;

      const modelsToSave =
        editingKey.allowedModels.length === totalAvailable ? [] : editingKey.allowedModels;

      const res = await fetch(`/api/keys/${editingKey.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedModels: modelsToSave }),
      });
      if (res.ok) {
        toast.success("Allowed models updated");
        setEditKeyDialogOpen(false);
        fetchAll();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update allowed models");
      }
    } catch {
      toast.error("Connection error");
    }
  }

  // ─── Derived data ───
  const selectedKey = selectedKeyId
    ? apiKeys.find((k) => k.id === selectedKeyId)
    : apiKeys.find((k) => k.enabled);
  const activeApiKey = selectedKey?.key || "wkz-xxxxxxxx";
  const endpoint =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.host}/api/v1`
      : "/api/v1";

  const activeProviders = providers.filter((p) => p.enabled);
  const activeCombos = combos.filter((c) => c.enabled);
  const enabledKeys = apiKeys.filter((k) => k.enabled);

  const allProviderModels = activeProviders.flatMap((p) =>
    p.models.map((m) => ({ id: `${p.prefix}/${m}`, display: m, type: "provider" as const }))
  );
  const allComboModels = activeCombos.map((c) => ({
    id: c.slug,
    display: c.name,
    type: "combo" as const,
  }));
  const allAvailable = [...allProviderModels, ...allComboModels];

  const keyAllowedModels = selectedKey?.allowedModels || [];
  const hasRestrictions = keyAllowedModels.length > 0;
  const availableModels = hasRestrictions
    ? allAvailable.filter((m) => keyAllowedModels.includes(m.id))
    : allAvailable;
  const firstModel = availableModels.length > 0 ? availableModels[0].id : "openai/gpt-4o";

  // ─── Empty state detection ───
  const isEmpty = useMemo(
    () => providers.length === 0 && apiKeys.length === 0 && combos.length === 0,
    [providers, apiKeys, combos]
  );

  // ─── System health ───
  const errorRate = usage && usage.totalRequests > 0
    ? (usage.totalErrors / usage.totalRequests) * 100
    : 0;
  const systemHealth =
    activeProviders.length === 0 || enabledKeys.length === 0
      ? "warning"
      : errorRate > 10
      ? "warning"
      : "healthy";

  // ─── Config generators ───
  function getClaudeCodeConfig() {
    return JSON.stringify(
      {
        hasCompletedOnboarding: true,
        env: {
          ANTHROPIC_BASE_URL: endpoint,
          ANTHROPIC_AUTH_TOKEN: activeApiKey,
          ANTHROPIC_MODEL: firstModel,
        },
      },
      null,
      2
    );
  }

  function getOpenCodeConfig() {
    const modelsObj: Record<string, { name: string }> = {};
    for (const m of availableModels) {
      modelsObj[m.id] = { name: m.display };
    }
    if (Object.keys(modelsObj).length === 0) {
      modelsObj["openai/gpt-4o"] = { name: "GPT-4o" };
    }
    return JSON.stringify(
      {
        $schema: "https://opencode.ai/config.json",
        provider: {
          wrouter: {
            name: "wrouter",
            npm: "@ai-sdk/openai-compatible",
            options: {
              baseURL: endpoint,
              apiKey: activeApiKey,
            },
            models: modelsObj,
          },
        },
      },
      null,
      2
    );
  }

  function getCurlChatConfig() {
    return [
      `curl ${endpoint}/chat/completions \\`,
      `  -H "Authorization: Bearer ${activeApiKey}" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '{`,
      `    "model": "${firstModel}",`,
      `    "messages": [{"role": "user", "content": "Hello"}]`,
      `  }'`,
    ].join("\n");
  }

  function getCurlModelsConfig() {
    return [
      `curl ${endpoint}/models \\`,
      `  -H "Authorization: Bearer ${activeApiKey}"`,
    ].join("\n");
  }

  // ─── Render ───
  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      {/* ═══ Welcome Header ═══ */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{getGreeting()}</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight mt-1">Dashboard</h2>
          <p className="text-muted-foreground mt-1">
            Overview of your WRouter instance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={
              systemHealth === "healthy"
                ? "border-green-300 text-green-700 dark:border-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30"
                : "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30"
            }
          >
            {systemHealth === "healthy" ? (
              <CheckCircle2 className="h-3 w-3 mr-1" />
            ) : (
              <AlertCircle className="h-3 w-3 mr-1" />
            )}
            {systemHealth === "healthy" ? "All systems operational" : "Needs attention"}
          </Badge>
        </div>
      </div>

      {/* ═══ Empty State ═══ */}
      {isEmpty && (
        <Card className="border-dashed border-2">
          <CardContent className="py-12 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Welcome to WRouter!</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Get started by adding a provider and creating an API key. Within minutes,
                you&apos;ll have a unified endpoint for all your AI models.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <Link href="/dashboard/providers">
                <Button>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Provider
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ Stats Overview ═══ */}
      {!isEmpty && (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Server}
            label="Providers"
            value={activeProviders.length}
            hint={`of ${providers.length} total`}
            href="/dashboard/providers"
            accent={activeProviders.length === 0 ? "warning" : "info"}
          />
          <StatCard
            icon={Key}
            label="API Keys"
            value={enabledKeys.length}
            hint={`${apiKeys.length} created`}
            accent={enabledKeys.length === 0 ? "warning" : "default"}
          />
          <StatCard
            icon={Layers}
            label="Combos"
            value={activeCombos.length}
            hint={combos.length > 0 ? `${combos.length} configured` : "Not configured"}
            href="/dashboard/combos"
          />
          <StatCard
            icon={Activity}
            label="Requests Today"
            value={usage ? formatNumber(usage.totalRequests) : "0"}
            hint={
              usage && usage.avgLatency > 0
                ? `${usage.avgLatency}ms avg latency`
                : "No requests yet"
            }
            href="/dashboard/usage"
            accent={usage && usage.totalRequests > 0 ? "success" : "default"}
          />
        </div>
      )}

      {/* ═══ Endpoint + Token Saver ═══ */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Endpoint */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Endpoint
              </CardTitle>
              <Badge variant="secondary" className="text-[10px]">
                OpenAI Compatible
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Base URL
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono truncate border">
                  {endpoint}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(endpoint);
                    toast.success("Endpoint copied");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Active Models
                </p>
                <p className="text-lg font-semibold">{allAvailable.length}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Errors Today
                </p>
                <p
                  className={`text-lg font-semibold ${
                    usage && usage.totalErrors > 0 ? "text-amber-600" : ""
                  }`}
                >
                  {usage?.totalErrors ?? 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Token Saver */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Token Saver
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">RTK Token Saver</p>
                  {settings.rtk_enabled === "true" && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-green-300 text-green-700 dark:border-green-700 dark:text-green-400">
                      ON
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {RTK_DESCRIPTION_SHORT}
                </p>
              </div>
              <Switch
                checked={settings.rtk_enabled === "true"}
                onCheckedChange={(checked) => toggleSetting("rtk_enabled", checked)}
              />
            </div>
            <div className="border-t" />
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">Caveman Mode</p>
                  {settings.caveman_enabled === "true" && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-green-300 text-green-700 dark:border-green-700 dark:text-green-400">
                      ON
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {CAVEMAN_DESCRIPTION_SHORT}
                </p>
              </div>
              <Switch
                checked={settings.caveman_enabled === "true"}
                onCheckedChange={(checked) => toggleSetting("caveman_enabled", checked)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══ API Keys ═══ */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                API Keys
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Create keys to authenticate requests to your endpoint
              </p>
            </div>
            <form onSubmit={createApiKey} className="flex gap-2">
              <Input
                placeholder="Key name (e.g. cursor, claude-code)"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="w-56"
              />
              <Button type="submit" size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Create
              </Button>
            </form>
          </div>
        </CardHeader>
        <CardContent>
          {apiKeys.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="font-semibold">Name</TableHead>
                    <TableHead className="font-semibold">Key</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Models</TableHead>
                    <TableHead className="font-semibold">Last Used</TableHead>
                    <TableHead className="text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.map((apiKey) => {
                    const isRevealed = revealedKeys.has(apiKey.id);
                    const allowedCount = Array.isArray(apiKey.allowedModels)
                      ? apiKey.allowedModels.filter(
                          (m) =>
                            typeof m === "string" &&
                            m !== "[" && m !== "]" && m !== "{" && m !== "}"
                        ).length
                      : 0;
                    return (
                      <TableRow key={apiKey.id} className="hover:bg-muted/20">
                        <TableCell className="font-medium">{apiKey.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <code className="text-xs bg-muted px-2 py-1 rounded font-mono select-all">
                              {isRevealed ? apiKey.key : maskApiKey(apiKey.key)}
                            </code>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => toggleReveal(apiKey.id)}
                              title={isRevealed ? "Hide" : "Reveal"}
                              aria-label={isRevealed ? "Hide API key" : "Reveal API key"}
                            >
                              {isRevealed ? (
                                <EyeOff className="h-3.5 w-3.5" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => {
                                navigator.clipboard.writeText(apiKey.key);
                                toast.success("Key copied");
                              }}
                              title="Copy"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={apiKey.enabled ? "default" : "secondary"}>
                            {apiKey.enabled ? "Active" : "Disabled"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {allowedCount === 0 ? (
                            <span className="text-muted-foreground">All allowed</span>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              {allowedCount} model{allowedCount !== 1 ? "s" : ""}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatRelativeTime(apiKey.lastUsedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <Switch
                              checked={apiKey.enabled}
                              onCheckedChange={(checked) =>
                                toggleApiKey(apiKey.id, checked)
                              }
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              onClick={() => openEditDialog(apiKey)}
                              title="Edit allowed models"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteApiKeyTarget(apiKey)}
                              title="Delete"
                              aria-label="Delete API key"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-12 text-center border-2 border-dashed rounded-md">
              <Key className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">No API keys yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create your first key above to start using the endpoint
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ Quick Configuration ═══ */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Quick Configuration
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Ready-to-use snippets for popular tools
              </p>
            </div>
            {enabledKeys.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">
                  Using key:
                </label>
                <Select value={selectedKeyId} onValueChange={(v) => setSelectedKeyId(v ?? "")}>
                  <SelectTrigger size="sm" className="min-w-[240px]">
                    <SelectValue placeholder="Select key">
                      {(value: string) => {
                        const key = enabledKeys.find((k) => k.id === value);
                        return key?.name || "Select key";
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {enabledKeys.map((key) => (
                      <SelectItem key={key.id} value={key.id}>
                        {key.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {enabledKeys.length === 0 ? (
            <div className="py-8 text-center border-2 border-dashed rounded-md">
              <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
              <p className="text-sm font-medium">No active API key</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create and enable an API key above to see configuration snippets
              </p>
            </div>
          ) : (
            <Tabs defaultValue="curl">
              <TabsList>
                <TabsTrigger value="curl">cURL</TabsTrigger>
                <TabsTrigger value="claude-code">Claude Code</TabsTrigger>
                <TabsTrigger value="opencode">OpenCode</TabsTrigger>
              </TabsList>
              <TabsContent value="curl" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Test Chat Completions</p>
                    <span className="text-xs text-muted-foreground">
                      Verify your endpoint is working
                    </span>
                  </div>
                  <CodeBlock code={getCurlChatConfig()} label="bash" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">List Available Models</p>
                    <span className="text-xs text-muted-foreground">
                      GET /models endpoint
                    </span>
                  </div>
                  <CodeBlock code={getCurlModelsConfig()} label="bash" />
                </div>
              </TabsContent>
              <TabsContent value="claude-code" className="mt-4 space-y-2">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Add to your Claude Code{" "}
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      settings.json
                    </code>
                  </p>
                  <CodeBlock code={getClaudeCodeConfig()} label="json" />
                </div>
              </TabsContent>
              <TabsContent value="opencode" className="mt-4 space-y-2">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Add to your{" "}
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      opencode.json
                    </code>
                  </p>
                  <CodeBlock code={getOpenCodeConfig()} label="json" />
                </div>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* ═══ Quick Links ═══ */}
      {!isEmpty && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/dashboard/providers"
            className="group flex items-center justify-between p-4 rounded-md border hover:border-primary/50 hover:bg-accent/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Server className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Manage Providers</span>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
          </Link>
          <Link
            href="/dashboard/combos"
            className="group flex items-center justify-between p-4 rounded-md border hover:border-primary/50 hover:bg-accent/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Configure Combos</span>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
          </Link>
          <Link
            href="/dashboard/usage"
            className="group flex items-center justify-between p-4 rounded-md border hover:border-primary/50 hover:bg-accent/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">View Logs</span>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
          </Link>
          <Link
            href="/dashboard/settings"
            className="group flex items-center justify-between p-4 rounded-md border hover:border-primary/50 hover:bg-accent/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Settings</span>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
          </Link>
        </div>
      )}

      {/* ═══ Edit API Key Dialog ═══ */}
      <Dialog open={editKeyDialogOpen} onOpenChange={setEditKeyDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Allowed Models</DialogTitle>
            <DialogDescription>
              Configure which models this API key can access. If all models are selected,
              all models are allowed by default.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Available Models</label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!editingKey) return;
                    const allModels = providers.flatMap((p) => {
                      if (!p.enabled) return [];
                      return p.models.map((m) => p.prefix + "/" + m);
                    });
                    const allComboSlugs = combos
                      .filter((c) => c.enabled)
                      .map((c) => c.slug);
                    setEditingKey({
                      ...editingKey,
                      allowedModels: [...allModels, ...allComboSlugs],
                    });
                  }}
                >
                  Enable All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!editingKey) return;
                    setEditingKey({
                      ...editingKey,
                      allowedModels: [],
                    });
                  }}
                >
                  Disable All
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto border rounded-md p-3 space-y-2">
              {providers
                .filter((p) => p.enabled)
                .map((provider) => (
                  <div key={provider.id} className="space-y-1">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {provider.name}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      {provider.models.map((model) => {
                        const fullModelName = provider.prefix + "/" + model;
                        const isSelected =
                          editingKey?.allowedModels.includes(fullModelName);
                        return (
                          <label
                            key={fullModelName}
                            className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isSelected || false}
                              onChange={(e) => {
                                if (!editingKey) return;
                                if (e.target.checked) {
                                  addModelToSelection(fullModelName);
                                } else {
                                  removeModel(fullModelName);
                                }
                              }}
                              className="rounded"
                            />
                            <span
                              className="text-sm flex-1 truncate"
                              title={fullModelName}
                            >
                              {model}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              {providers.filter((p) => p.enabled).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No active providers. Enable providers first to see available models.
                </p>
              )}
              {combos.filter((c) => c.enabled).length > 0 && (
                <div className="space-y-1 border-t pt-3 mt-3">
                  <div className="text-xs font-semibold text-primary uppercase tracking-wide">
                    Combos
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {combos
                      .filter((c) => c.enabled)
                      .map((combo) => {
                        const isSelected = editingKey?.allowedModels.includes(combo.slug);
                        return (
                          <label
                            key={combo.id}
                            className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isSelected || false}
                              onChange={(e) => {
                                if (!editingKey) return;
                                if (e.target.checked) {
                                  addModelToSelection(combo.slug);
                                } else {
                                  removeModel(combo.slug);
                                }
                              }}
                              className="rounded"
                            />
                            <span
                              className="text-sm flex-1 truncate"
                              title={combo.slug}
                            >
                              {combo.name}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {combo.slug}
                            </span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditKeyDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveAllowedModels}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete API Key Confirmation Dialog */}
      <Dialog
        open={!!deleteApiKeyTarget}
        onOpenChange={(open) => !open && setDeleteApiKeyTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Hapus API Key
            </DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin menghapus API key{" "}
              <strong className="text-foreground">
                {deleteApiKeyTarget?.name}
              </strong>
              ? Tindakan ini tidak dapat dibatalkan dan permintaan API yang
              menggunakan key ini akan gagal.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteApiKeyTarget(null)}
            >
              Batal
            </Button>
            <Button variant="destructive" onClick={confirmDeleteApiKey}>
              Hapus API Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

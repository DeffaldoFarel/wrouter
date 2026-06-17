"use client";

import { useEffect, useState, useCallback } from "react";
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
import { RefreshCw, CheckCircle, XCircle, Loader, Clock, KeyRound } from "lucide-react";
import { KNOWN_API_KEY_PROVIDERS, type KnownApiKeyProvider } from "@/lib/constants/providers";

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
}

// Known API Key Providers — always shown regardless of connection status


function ApiKeyProviderSlot({
  known,
  connected,
  healthMap,
}: {
  known: KnownApiKeyProvider;
  connected: Provider | null;
  healthMap: Record<string, HealthResult>;
}) {
  const href = connected
    ? `/dashboard/providers/${connected.id}`
    : `/dashboard/providers/setup/${known.prefix}`;

  return (
    <Link href={href}>
      <div className={`flex flex-col gap-2 rounded-lg border bg-card px-3 py-2.5 cursor-pointer transition-colors hover:bg-accent/50 hover:border-primary/30 ${
        connected ? "border-border" : "border-dashed"
      }`}>
        {/* Top: icon + name + status dot */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`flex items-center justify-center h-6 w-6 rounded-md shrink-0 ${
              connected ? "bg-primary/10" : "bg-muted"
            }`}>
              <KeyRound className={`h-3 w-3 ${connected ? "text-primary" : "text-muted-foreground"}`} />
            </div>
            <span className="text-sm font-medium leading-tight truncate">{known.name}</span>
          </div>
          {connected ? (
            <span className={`h-2 w-2 rounded-full shrink-0 ${
              !connected.enabled ? "bg-muted-foreground" :
              (() => {
                const h = healthMap[connected.id];
                if (h?.status === "online") return "bg-green-500";
                if (h?.status === "offline") return "bg-destructive";
                return "bg-yellow-500";
              })()
            }`} />
          ) : (
            <span className="text-[10px] text-muted-foreground">Not set up</span>
          )}
        </div>

        {/* Description */}
        <p className="text-[11px] text-muted-foreground leading-tight">{known.description}</p>

        {/* Bottom: model count or connect hint */}
        {connected ? (
          <p className="text-[11px] text-muted-foreground">
            {connected.models.length > 0 ? `${connected.models.length} models` : "No models cached"}
            {connected.prefix && <span className="font-mono ml-1 opacity-60">{connected.prefix}/</span>}
          </p>
        ) : (
          <p className="text-[11px] text-primary/70">Click to connect →</p>
        )}
      </div>
    </Link>
  );
}

function ProviderCard({
  provider,
  healthMap,
  onToggle,
}: {
  provider: Provider;
  healthMap: Record<string, HealthResult>;
  onToggle: (id: string, enabled: boolean) => void;
}) {
  return (
    <Link href={`/dashboard/providers/${provider.id}`}>
      <div className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-2.5 cursor-pointer transition-colors hover:bg-accent/50 hover:border-primary/30">
        {/* Top: icon + name + toggle */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center justify-center h-6 w-6 rounded-md shrink-0 bg-muted">
              <KeyRound className="h-3 w-3 text-muted-foreground" />
            </div>
            <span className="text-sm font-medium leading-tight truncate">{provider.name}</span>
          </div>
          {/* Stop propagation so toggle click doesn't navigate */}
          <div onClick={(e) => e.preventDefault()}>
            <Switch
              checked={provider.enabled}
              onCheckedChange={(checked) => onToggle(provider.id, checked)}
            />
          </div>
        </div>

        {/* Base URL */}
        <p className="text-[11px] text-muted-foreground font-mono leading-tight truncate">{provider.baseUrl}</p>

        {/* Bottom: health + model count */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(() => {
            const h = healthMap[provider.id];
            if (!h || h.status === "unknown") return (
              <Badge variant="secondary" className="text-[10px] gap-1 h-4 px-1">
                <Clock className="h-2 w-2" />Unknown
              </Badge>
            );
            if (h.status === "checking") return (
              <Badge variant="secondary" className="text-[10px] gap-1 h-4 px-1">
                <Loader className="h-2 w-2 animate-spin" />Checking
              </Badge>
            );
            if (h.status === "online") return (
              <Badge variant="secondary" className="text-[10px] gap-1 h-4 px-1 text-green-500 border-green-500/30 bg-green-500/10">
                <CheckCircle className="h-2 w-2" />{h.latencyMs ? `${h.latencyMs}ms` : "Online"}
              </Badge>
            );
            return (
              <Badge variant="secondary" className="text-[10px] gap-1 h-4 px-1 text-destructive border-destructive/30 bg-destructive/10">
                <XCircle className="h-2 w-2" />Offline
              </Badge>
            );
          })()}
          <span className="text-[11px] text-muted-foreground ml-auto">
            {provider.models.length > 0 ? `${provider.models.length} models` : "No models"}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [healthMap, setHealthMap] = useState<Record<string, HealthResult>>({});
  const [checkingAll, setCheckingAll] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [formType, setFormType] = useState<"custom" | "apikey">("custom");

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

  async function checkHealth(providerId: string) {
    setHealthMap((prev) => ({
      ...prev,
      [providerId]: { status: "checking" },
    }));

    try {
      const res = await fetch(`/api/providers/${providerId}/health`);
      const data = await res.json();

      setHealthMap((prev) => ({
        ...prev,
        [providerId]: {
          status: data.online ? "online" : "offline",
          latencyMs: data.latencyMs,
          error: data.error,
        },
      }));
    } catch {
      setHealthMap((prev) => ({
        ...prev,
        [providerId]: { status: "offline", error: "Connection failed" },
      }));
    }
  }

  async function checkAllHealth() {
    setCheckingAll(true);
    await Promise.all(providers.map((p) => checkHealth(p.id)));
    setCheckingAll(false);
  }

  function resetForm() {
    setName("");
    setPrefix("");
    setBaseUrl("");
    setApiKey("");
    setFormType("custom");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, prefix, baseUrl, apiKey, type: formType }),
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
        toast(enabled ? "Provider enabled" : "Provider disabled");
      } else {
        toast.error("Failed to update provider");
      }
    } catch {
      toast.error("Failed to update provider");
    }
  }

  async function deleteProvider(id: string) {
    if (!confirm("Are you sure you want to delete this provider?")) return;

    try {
      const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Provider deleted");
        fetchProviders();
      }
    } catch {
      toast.error("Failed to delete provider");
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-muted-foreground gap-2"><div className="w-4 h-4 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" /><span className="text-sm">Loading providers...</span></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Providers</h2>
          <p className="text-muted-foreground mt-1">
            Manage your AI API providers
          </p>
        </div>
        <div className="flex items-center gap-2">
          {providers.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={checkAllHealth}
              disabled={checkingAll}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${checkingAll ? "animate-spin" : ""}`} />
              Check All
            </Button>
          )}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger render={<Button onClick={() => { resetForm(); setDialogOpen(true); }} />}>
              Add Provider
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Custom Provider</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g. OpenAI, Groq, DeepSeek"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prefix">Prefix</Label>
                  <Input
                    id="prefix"
                    placeholder="e.g. openai, groq, deepseek"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Used to call models: <code>{prefix || "prefix"}/model-name</code>
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="baseUrl">Base URL</Label>
                  <Input
                    id="baseUrl"
                    placeholder={formType === "apikey" ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1"}
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    required
                  />
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
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Add</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Provider List */}
      <div className="space-y-8">
        {/* API Key Providers — always shown */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">API Key Providers</h3>
            <p className="text-xs text-muted-foreground ml-1">Aggregators with their own model catalog</p>
          </div>
          <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
            {KNOWN_API_KEY_PROVIDERS.map((known) => {
              // Match by type + name instead of prefix, so prefix changes don't break the link
              const connected = providers.find(p => p.name === known.name && p.type === "apikey") ?? null;
              return (
                <ApiKeyProviderSlot
                  key={known.prefix}
                  known={known}
                  connected={connected}
                  healthMap={healthMap}
                />
              );
            })}
          </div>
        </div>

        {/* Custom Providers */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Custom Providers</h3>
            {providers.filter(p => p.type !== "apikey").length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {providers.filter(p => p.type !== "apikey").length}
              </Badge>
            )}
            <p className="text-xs text-muted-foreground ml-1">Direct OpenAI-compatible endpoints</p>
          </div>
          {providers.filter(p => p.type !== "apikey").length === 0 ? (
            <p className="text-xs text-muted-foreground py-3">No custom providers yet. Click &quot;Add Provider&quot; to add one.</p>
          ) : (
            <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
              {providers.filter(p => p.type !== "apikey").map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  healthMap={healthMap}
                  onToggle={toggleProvider}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


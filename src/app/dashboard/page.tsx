"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Pencil } from "lucide-react";

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

export default function DashboardPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [editKeyDialogOpen, setEditKeyDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
  const [selectedKeyId, setSelectedKeyId] = useState<string>("");

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    try {
      const [settingsData, keysData, providersData, combosData] = await Promise.all([
        fetch("/api/settings").then((r) => r.json()),
        fetch("/api/keys").then((r) => r.json()),
        fetch("/api/providers").then((r) => r.json()),
        fetch("/api/combos").then((r) => r.json()),
      ]);

      if (settingsData && typeof settingsData === "object") {
        setSettings(settingsData);
      }

      if (Array.isArray(keysData)) {
        setApiKeys(keysData);
        // Auto-select first enabled key
        const firstEnabled = keysData.find((k: ApiKey) => k.enabled);
        if (firstEnabled && !selectedKeyId) {
          setSelectedKeyId(firstEnabled.id);
        }
      }

      if (Array.isArray(providersData)) {
        setProviders(providersData);
      }

      if (Array.isArray(combosData)) {
        setCombos(combosData);
      }
    } catch {
      // silent
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
        toast.success("Setting updated");
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
      await fetch(`/api/keys/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      fetchAll();
    } catch {
      toast.error("Failed to update API key");
    }
  }

  async function deleteApiKey(id: string) {
    if (!confirm("Are you sure you want to delete this API key?")) return;

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

  function openEditDialog(key: ApiKey) {
    // Defensive parsing - ensure allowedModels is a valid array
    let allowedModels: string[] = [];
    if (Array.isArray(key.allowedModels)) {
      // Filter out invalid entries like "[", "]", etc
      allowedModels = key.allowedModels.filter(
        (m) => typeof m === "string" && m !== "[" && m !== "]" && m !== "{" && m !== "}"
      );
    }
    
    // If empty, populate with all available models (empty = all allowed)
    if (allowedModels.length === 0) {
      const allModels = providers
        .filter((p) => p.enabled)
        .flatMap((p) => p.models.map((m) => p.prefix + '/' + m));
      const allCombos = combos
        .filter((c) => c.enabled)
        .map((c) => c.slug);
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
      // Get all available models (providers + combos)
      const allModels = providers
        .filter((p) => p.enabled)
        .flatMap((p) => p.models.map((m) => p.prefix + '/' + m));
      const allComboSlugs = combos
        .filter((c) => c.enabled)
        .map((c) => c.slug);
      const totalAvailable = allModels.length + allComboSlugs.length;
      
      // If all models are selected, save as empty array (all allowed)
      const modelsToSave = editingKey.allowedModels.length === totalAvailable 
        ? [] 
        : editingKey.allowedModels;

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

  // Get active API key for config examples (use selected key or fallback to first enabled)
  const selectedKey = selectedKeyId
    ? apiKeys.find((k) => k.id === selectedKeyId)
    : apiKeys.find((k) => k.enabled);
  const activeApiKey = selectedKey?.key || "wkz-xxxxxxxx";
  const endpoint = "http://localhost:20128/api/v1";

  // Get all models from active providers for OpenCode config
  const activeProviders = providers.filter((p) => p.enabled);
  const activeCombos = combos.filter((c) => c.enabled);

  // Build unified available models list based on selected API key
  // Combos are treated the same as regular models everywhere
  const allProviderModels = activeProviders.flatMap((p) =>
    p.models.map((m) => ({ id: `${p.prefix}/${m}`, display: m, type: "provider" as const }))
  );
  const allComboModels = activeCombos.map((c) =>
    ({ id: c.slug, display: c.name, type: "combo" as const })
  );
  const allAvailable = [...allProviderModels, ...allComboModels];

  // Filter by allowedModels if the selected key has restrictions
  const keyAllowedModels = selectedKey?.allowedModels || [];
  const hasRestrictions = keyAllowedModels.length > 0;

  const availableModels = hasRestrictions
    ? allAvailable.filter((m) => keyAllowedModels.includes(m.id))
    : allAvailable;

  // First model for config examples
  const firstModel = availableModels.length > 0
    ? availableModels[0].id
    : "gpt-4o";

  // Generate Claude Code settings.json
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

  // Generate OpenCode opencode.json
  function getOpenCodeConfig() {
    const modelsObj: Record<string, { name: string }> = {};

    for (const m of availableModels) {
      modelsObj[m.id] = { name: m.display };
    }

    // If no models, add placeholder
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

  // Generate cURL example for chat completions
  function getCurlConfig() {
    return `curl ${endpoint}/chat/completions \\
  -H "Authorization: Bearer ${activeApiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
  "model": "${firstModel}",
  "messages": [{"role": "user", "content": "Hello"}]
}'`;
  }

  // Generate cURL example for fetching models (GET request, no body needed)
  function getCurlFetchModels() {
    return `curl ${endpoint}/models \\
  -H "Authorization: Bearer ${activeApiKey}"`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground mt-1">
          Overview of your WRouter instance
        </p>
      </div>

      {/* Top Section: Endpoint Config (left) + Token Saver (right) */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Left: Endpoint Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Endpoint Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">OpenAI-Compatible Endpoint</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono truncate">
                  {endpoint}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(endpoint);
                    toast.success("Copied to clipboard");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Copy
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <div>
                <Badge variant="secondary">Ready</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right: Token Saver */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Token Saver</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">RTK Token Saver</p>
                <p className="text-xs text-muted-foreground">
                  Compress tool_result content. Saves 20-40% input tokens.
                </p>
              </div>
              <Switch
                checked={settings.rtk_enabled === "true"}
                onCheckedChange={(checked) => toggleSetting("rtk_enabled", checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Caveman Mode</p>
                <p className="text-xs text-muted-foreground">
                  Terse-style output. Saves up to 65% output tokens.
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

      {/* API Keys */}
      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Create API keys to authenticate requests to the WRouter endpoint.
          </p>

          {/* Create new key */}
          <form onSubmit={createApiKey} className="flex gap-2">
            <Input
              placeholder="Key name (e.g. cursor, claude-code)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="max-w-xs"
            />
            <Button type="submit">Create Key</Button>
          </form>

          {/* Keys table */}
          {apiKeys.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Used</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.map((apiKey) => (
                    <TableRow key={apiKey.id}>
                      <TableCell className="font-medium">{apiKey.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                            {apiKey.key}
                          </code>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(apiKey.key);
                              toast.success("Copied to clipboard");
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            Copy
                          </button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={apiKey.enabled ? "default" : "secondary"}>
                          {apiKey.enabled ? "Active" : "Disabled"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {apiKey.lastUsedAt
                          ? new Date(apiKey.lastUsedAt).toLocaleString()
                          : "Never"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <Switch
                            checked={apiKey.enabled}
                            onCheckedChange={(checked) => toggleApiKey(apiKey.id, checked)}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditDialog(apiKey)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteApiKey(apiKey.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center border rounded-md">
              No API keys created yet. Create one to start using the endpoint.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Quick Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Quick Configuration</CardTitle>
            {apiKeys.filter((k) => k.enabled).length > 0 && (
              <div className="flex items-center gap-2">
                <label htmlFor="config-api-key" className="text-sm text-muted-foreground">
                  API Key:
                </label>
                <select
                  id="config-api-key"
                  value={selectedKeyId}
                  onChange={(e) => setSelectedKeyId(e.target.value)}
                  className="px-3 py-1.5 text-sm border rounded-md bg-background hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  {apiKeys
                    .filter((k) => k.enabled)
                    .map((key) => (
                      <option key={key.id} value={key.id}>
                        {key.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="curl">
            <TabsList>
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="claude-code">Claude Code</TabsTrigger>
              <TabsTrigger value="opencode">OpenCode</TabsTrigger>
            </TabsList>
            <TabsContent value="curl" className="mt-4">
              <div className="space-y-4">
                {/* Test Chat Completions */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Test Chat Completions:</p>
                  <p className="text-sm text-muted-foreground">
                    Send a test message to verify your endpoint is working:
                  </p>
                  <div className="relative">
                    <pre className="rounded-md bg-muted p-4 text-xs font-mono overflow-x-auto">
                      {getCurlConfig()}
                    </pre>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(getCurlConfig());
                        toast.success("Copied to clipboard");
                      }}
                      className="absolute top-2 right-2 text-xs text-muted-foreground hover:text-foreground bg-muted px-2 py-1 rounded"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                {/* Fetch Models */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Fetch Available Models:</p>
                  <p className="text-sm text-muted-foreground">
                    List all models available through your WRouter endpoint:
                  </p>
                  <div className="relative">
                    <pre className="rounded-md bg-muted p-4 text-xs font-mono overflow-x-auto">
                      {getCurlFetchModels()}
                    </pre>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(getCurlFetchModels());
                        toast.success("Copied to clipboard");
                      }}
                      className="absolute top-2 right-2 text-xs text-muted-foreground hover:text-foreground bg-muted px-2 py-1 rounded"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="claude-code" className="mt-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Add this to your Claude Code <code className="text-xs bg-muted px-1 py-0.5 rounded">settings.json</code>:
                </p>
                <div className="relative">
                  <pre className="rounded-md bg-muted p-4 text-xs font-mono overflow-x-auto">
                    {getClaudeCodeConfig()}
                  </pre>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(getClaudeCodeConfig());
                      toast.success("Copied to clipboard");
                    }}
                    className="absolute top-2 right-2 text-xs text-muted-foreground hover:text-foreground bg-muted px-2 py-1 rounded"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="opencode" className="mt-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Add this to your <code className="text-xs bg-muted px-1 py-0.5 rounded">opencode.json</code>:
                </p>
                <div className="relative">
                  <pre className="rounded-md bg-muted p-4 text-xs font-mono overflow-x-auto">
                    {getOpenCodeConfig()}
                  </pre>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(getOpenCodeConfig());
                      toast.success("Copied to clipboard");
                    }}
                    className="absolute top-2 right-2 text-xs text-muted-foreground hover:text-foreground bg-muted px-2 py-1 rounded"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Edit API Key Dialog */}
      <Dialog open={editKeyDialogOpen} onOpenChange={setEditKeyDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Allowed Models</DialogTitle>
            <DialogDescription>
              Configure which models this API key can access. If all models are selected, all models are allowed by default.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Available Models */}
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Available Models</label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!editingKey) return;
                  const allModels = providers.flatMap((p) => {
                    if (!p.enabled) return [];
                    return p.models.map((m) => p.prefix + '/' + m);
                  });
                  const allComboSlugs = combos
                    .filter((c) => c.enabled)
                    .map((c) => c.slug);
                  setEditingKey({ ...editingKey, allowedModels: [...allModels, ...allComboSlugs] });
                }}
              >
                Select All
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto border rounded-md p-3 space-y-2">
              {providers.filter((p) => p.enabled).map((provider) => (
                <div key={provider.id} className="space-y-1">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {provider.name}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {provider.models.map((model) => {
                      const fullModelName = provider.prefix + '/' + model;
                      const isSelected = editingKey?.allowedModels.includes(fullModelName);
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
                          <span className="text-sm flex-1 truncate" title={fullModelName}>
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

              {/* Combos */}
              {combos.filter((c) => c.enabled).length > 0 && (
                <div className="space-y-1 border-t pt-3 mt-3">
                  <div className="text-xs font-semibold text-primary uppercase tracking-wide">
                    Combos
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {combos.filter((c) => c.enabled).map((combo) => {
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
                          <span className="text-sm flex-1 truncate" title={combo.slug}>
                            {combo.name}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono">{combo.slug}</span>
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
            <Button onClick={saveAllowedModels}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

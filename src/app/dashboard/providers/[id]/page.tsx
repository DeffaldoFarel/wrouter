"use client";

import { useEffect, useState } from "react";
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
import { ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";

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

export default function ProviderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Edit form state
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [modelList, setModelList] = useState<string[]>([]);
  const [newModel, setNewModel] = useState("");

  useEffect(() => {
    fetchProvider();
  }, []);

  async function fetchProvider() {
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
  }

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

    if (apiKey) {
      payload.apiKey = apiKey;
    }

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
      fetchProvider();
    } catch {
      toast.error("Failed to update provider");
    }
  }

  async function deleteProvider() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/providers/${params.id}`, {
        method: "DELETE",
      });
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

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-muted-foreground gap-2"><div className="w-4 h-4 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" /><span className="text-sm">Loading provider...</span></div>;
  }

  if (!provider) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/providers">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <h2 className="text-3xl font-bold tracking-tight">{provider.name}</h2>
          <p className="text-muted-foreground mt-0.5 font-mono text-sm">
            {provider.prefix}/
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={provider.enabled ? "default" : "secondary"}>
            {provider.enabled ? "Enabled" : "Disabled"}
          </Badge>
          <Switch
            checked={provider.enabled}
            onCheckedChange={toggleProvider}
          />
          <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
            <DialogTrigger render={
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" />
            }>
              <Trash2 className="h-4 w-4" />
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Provider</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete <strong>{provider.name}</strong>? This action cannot be undone and will remove all associated models.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} disabled={deleting}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={deleteProvider} disabled={deleting}>
                  {deleting ? "Deleting..." : "Delete Provider"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Provider Settings */}
      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Provider Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
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
                  onChange={(e) => setPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                  required
                />
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
                  <span className="text-xs text-muted-foreground shrink-0">Preconfigured</span>
                </div>
              ) : (
                <Input
                  id="baseUrl"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  required
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key (leave empty to keep current)</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="Enter new API key to update"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Models */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Models</CardTitle>
              <div className="flex items-center gap-2">
                {modelList.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      if (confirm("Are you sure you want to delete all models?")) {
                        setModelList([]);
                      }
                    }}
                  >
                    Delete All
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={fetchingModels}
                  onClick={handleFetchModels}
                >
                  {fetchingModels ? "Fetching..." : "Fetch Models"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Use <code className="text-xs bg-muted px-1 py-0.5 rounded">{prefix}/model-name</code> to route requests to this provider.
            </p>

            {/* Add model input */}
            <div className="flex gap-2">
              <Input
                placeholder="Enter model name (e.g. gpt-4o)"
                value={newModel}
                onChange={(e) => setNewModel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addModel();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addModel}>
                Add
              </Button>
            </div>

            {/* Model cards */}
            {modelList.length > 0 ? (
              <div className="grid gap-2">
                {modelList.map((model) => (
                  <div
                    key={model}
                    className="flex items-center justify-between rounded-md border px-4 py-2"
                  >
                    <span className="text-sm font-mono">{model}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeModel(model)}
                    >
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center border rounded-md">
                No models added yet. Add manually or use &quot;Fetch Models&quot;.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={!hasChanges}>Save Changes</Button>
        </div>
      </form>
    </div>
  );
}

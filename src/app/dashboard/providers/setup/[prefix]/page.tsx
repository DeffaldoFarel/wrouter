"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { KeyRound, Loader, AlertCircle, ArrowLeft, ExternalLink } from "lucide-react";
import { KNOWN_API_KEY_PROVIDERS, type KnownApiKeyProvider } from "@/lib/constants/providers";
import Link from "next/link";

export default function ProviderSetupPage() {
  const params = useParams();
  const router = useRouter();
  const prefix = params.prefix as string;

  const [known, setKnown] = useState<KnownApiKeyProvider | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const found = KNOWN_API_KEY_PROVIDERS.find((p) => p.prefix === prefix);
    if (!found) {
      // Unknown prefix — redirect back
      router.push("/dashboard/providers");
      return;
    }
    setKnown(found);
  }, [prefix, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!known || !apiKey) return;

    setConnecting(true);
    try {
      // 1. Create provider
      const createRes = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: known.name,
          prefix: known.prefix,
          baseUrl: known.baseUrl,
          apiKey,
          type: "apikey",
        }),
      });

      if (!createRes.ok) {
        const data = await createRes.json();
        toast.error(data.error || `Failed to connect ${known.name}`);
        return;
      }

      const newProvider = await createRes.json();

      // 2. Auto-fetch models
      try {
        const modelsRes = await fetch("/api/providers/fetch-models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerId: newProvider.id }),
        });

        if (modelsRes.ok) {
          const { models, count } = await modelsRes.json();
          if (models?.length > 0) {
            await fetch(`/api/providers/${newProvider.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ models }),
            });
            toast.success(`${known.name} connected — ${count} models cached`);
          } else {
            toast.success(`${known.name} connected`);
          }
        } else {
          toast.success(`${known.name} connected (models fetch failed)`);
        }
      } catch {
        toast.success(`${known.name} connected`);
      }

      // 3. Navigate to the provider detail page
      router.push(`/dashboard/providers/${newProvider.id}`);
    } catch {
      toast.error("Connection error");
    } finally {
      setConnecting(false);
    }
  }

  if (!known) return null;

  return (
    <div className="space-y-6 max-w-lg">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/providers">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{known.name}</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">{known.description}</p>
        </div>
      </div>

      {/* Setup Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connect {known.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Info row */}
            <div className="rounded-md border bg-muted/40 px-3 py-2.5 space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Base URL</span>
                <code className="text-xs font-mono">{known.baseUrl}</code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Prefix</span>
                <code className="text-xs font-mono">{known.prefix}/</code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="text-xs">API Key Provider</span>
              </div>
            </div>

            {/* API Key input */}
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder={known.keyPlaceholder}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoFocus
                required
              />
              {known.keyHint && (
                <p className="text-xs text-muted-foreground">
                  Get your API key at{" "}
                  <a
                    href={known.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 underline hover:text-foreground"
                  >
                    {known.keyHint}
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </p>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              After connecting, models will be automatically fetched and cached.
              You can manage models and update your API key from the provider detail page.
            </p>

            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/dashboard/providers")}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={connecting || !apiKey}>
                {connecting ? (
                  <><Loader className="h-3.5 w-3.5 mr-1.5 animate-spin" />Connecting...</>
                ) : (
                  `Connect ${known.name}`
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

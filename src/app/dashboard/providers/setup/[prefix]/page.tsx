"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2,
  ArrowLeft,
  ExternalLink,
  ChevronRight,
  Server,
  CheckCircle2,
  Eye,
  EyeOff,
  Copy,
  Sparkles,
  Shield,
  Zap,
} from "lucide-react";
import { KNOWN_API_KEY_PROVIDERS, type KnownApiKeyProvider } from "@/lib/constants/providers";
import { getProviderIcon } from "@/components/provider-icons";
import Link from "next/link";

// ─────────────────────────────────────────────
//  Brand Icon
// ─────────────────────────────────────────────

function BrandIcon({ provider }: { provider: KnownApiKeyProvider }) {
  const Icon = getProviderIcon(provider.prefix);
  if (Icon) {
    return (
      <div
        className="flex items-center justify-center rounded-lg shrink-0 bg-muted/50 border h-12 w-12"
        style={provider.brandColor ? { color: provider.brandColor } : undefined}
      >
        <Icon className="h-7 w-7" />
      </div>
    );
  }
  if (provider.brandColor && provider.iconLabel) {
    return (
      <div
        className="flex items-center justify-center rounded-lg shrink-0 font-bold text-white h-12 w-12 text-base"
        style={{ backgroundColor: provider.brandColor }}
      >
        {provider.iconLabel}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center rounded-lg shrink-0 bg-muted h-12 w-12">
      <Server className="h-6 w-6 text-muted-foreground" />
    </div>
  );
}

// ─────────────────────────────────────────────
//  Main Setup Page
// ─────────────────────────────────────────────

export default function ProviderSetupPage() {
  const params = useParams();
  const router = useRouter();
  const prefix = params.prefix as string;

  const [known, setKnown] = useState<KnownApiKeyProvider | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [progress, setProgress] = useState<"idle" | "creating" | "fetching" | "done">("idle");

  useEffect(() => {
    const found = KNOWN_API_KEY_PROVIDERS.find((p) => p.prefix === prefix);
    if (!found) {
      router.push("/dashboard/providers");
      return;
    }
    setKnown(found);
  }, [prefix, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!known || !apiKey) return;

    setConnecting(true);
    setProgress("creating");

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
        setProgress("idle");
        return;
      }

      const newProvider = await createRes.json();
      setProgress("fetching");

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

      setProgress("done");

      // 3. Navigate to the provider detail page
      setTimeout(() => {
        router.push(`/dashboard/providers/${newProvider.id}`);
      }, 600);
    } catch {
      toast.error("Connection error");
      setProgress("idle");
    } finally {
      setConnecting(false);
    }
  }

  function copyBaseUrl() {
    if (!known) return;
    navigator.clipboard.writeText(known.baseUrl);
    toast.success("Base URL copied");
  }

  if (!known) return null;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* ═══ Breadcrumbs ═══ */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground transition-colors">
          Dashboard
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href="/dashboard/providers" className="hover:text-foreground transition-colors">
          Providers
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">Connect {known.name}</span>
      </nav>

      {/* ═══ Header ═══ */}
      <div className="flex items-start gap-4">
        <Link href="/dashboard/providers">
          <Button variant="ghost" size="sm" className="mt-1">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-start gap-4 flex-1">
          <BrandIcon provider={known} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">{known.name}</h1>
              <Badge variant="outline" className="text-[10px]">
                API Key Provider
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{known.description}</p>
          </div>
        </div>
      </div>

      {/* ═══ Setup Card ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Connect {known.name}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter your API key to start routing requests through {known.name}.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Connection Info */}
            <div className="rounded-md border bg-muted/30 divide-y">
              <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Base URL
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <code className="text-xs font-mono text-foreground/80 max-w-[260px] truncate">
                    {known.baseUrl}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={copyBaseUrl}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Prefix
                </span>
                <code className="text-xs font-mono text-foreground/80">
                  {known.prefix}/
                </code>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Type
                </span>
                <span className="text-xs">API Key Provider</span>
              </div>
            </div>

            {/* API Key input */}
            <div className="space-y-2">
              <Label htmlFor="apiKey" className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                  API Key
                </span>
                {known.docsUrl && (
                  <a
                    href={known.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-0.5 font-normal"
                  >
                    Get API key
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showKey ? "text" : "password"}
                  placeholder={known.keyPlaceholder}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoFocus
                  required
                  className="pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {known.keyHint && (
                <p className="text-xs text-muted-foreground">
                  Find your API key at{" "}
                  <a
                    href={known.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground inline-flex items-center gap-0.5"
                  >
                    {known.keyHint}
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </p>
              )}
            </div>

            {/* What happens next */}
            <div className="rounded-md border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                What happens next
              </div>
              <ol className="text-xs text-muted-foreground space-y-1 ml-5 list-decimal">
                <li>API key is encrypted and stored securely</li>
                <li>Available models are auto-fetched and cached</li>
                <li>You can immediately route requests via{" "}
                  <code className="bg-background px-1 py-0.5 rounded text-foreground/80">
                    {known.prefix}/model-name
                  </code>
                </li>
              </ol>
            </div>

            {/* Progress Indicator */}
            {connecting && (
              <div className="rounded-md border bg-primary/5 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  {progress === "creating" && (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>Creating provider...</span>
                    </>
                  )}
                  {progress === "fetching" && (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>Fetching available models...</span>
                    </>
                  )}
                  {progress === "done" && (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="font-medium text-green-700 dark:text-green-400">
                        Connected! Redirecting...
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 justify-end pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/dashboard/providers")}
                disabled={connecting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={connecting || !apiKey}>
                {connecting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Zap className="h-3.5 w-3.5 mr-1.5" />
                    Connect {known.name}
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ═══ Security Note ═══ */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-md border bg-muted/20">
        <Shield className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Your API key is safe</p>
          <p>
            Keys are encrypted with AES-256-GCM before being stored, and never logged.
            You can revoke or rotate your key anytime from the provider detail page.
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ExternalLink,
  Copy,
  Check,
  Loader2,
  Key,
  Shield,
  RefreshCw,
} from "lucide-react";
import { getOAuthProviderLabel } from "@/lib/constants/oauth-providers";

interface OAuthFlowModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: string | null;
  onSuccess: () => void;
}

type FlowStep = "init" | "authorize" | "exchange" | "device_code" | "poll" | "import" | "social" | "success";

interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval?: number;
  expiresIn?: number;
}

export function OAuthFlowModal({
  open,
  onOpenChange,
  provider,
  onSuccess,
}: OAuthFlowModalProps) {
  const [step, setStep] = useState<FlowStep>("init");
  const [authUrl, setAuthUrl] = useState<string>("");
  const [codeVerifier, setCodeVerifier] = useState<string>("");
  const [state, setState] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [deviceCode, setDeviceCode] = useState<DeviceCodeResponse | null>(null);
  const [polling, setPolling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (open && provider) {
      setStep("init");
      setAuthUrl("");
      setCodeVerifier("");
      setState("");
      setCode("");
      setDeviceCode(null);
      setPolling(false);
      setCopied(false);
      setError("");
      setLoading(false);
      initFlow();
    }
  }, [open, provider]);

  const initFlow = async () => {
    if (!provider) return;

    setLoading(true);
    try {
      // Check provider flow type
      if (provider === "github") {
        // Device code flow
        await initDeviceCodeFlow();
      } else if (provider === "kiro") {
        // Show method selection (don't auto-start)
        setStep("init");
        setLoading(false);
        return;
      } else if (provider === "cursor") {
        // Import token flow
        setStep("import");
      } else {
        // Authorization code flow (claude, codex, gemini-cli)
        await initAuthCodeFlow();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initialize flow");
    } finally {
      setLoading(false);
    }
  };

  const initAuthCodeFlow = async () => {
    const res = await fetch(`/api/oauth/${provider}/authorize`);
    if (!res.ok) throw new Error("Failed to generate auth URL");

    const data = await res.json();
    setAuthUrl(data.authUrl);
    setCodeVerifier(data.codeVerifier);
    setState(data.state);
    setStep("authorize");
  };

  const initDeviceCodeFlow = async () => {
    const res = await fetch(`/api/oauth/${provider}/device-code`);
    if (!res.ok) throw new Error("Failed to get device code");

    const data: DeviceCodeResponse = await res.json();
    setDeviceCode(data);
    setStep("device_code");
    startPolling(data.deviceCode);
  };

  const startPolling = async (deviceCodeStr: string) => {
    setPolling(true);
    const interval = deviceCode?.interval ?? 5;

    const poll = async () => {
      try {
        const res = await fetch(`/api/oauth/${provider}/poll`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceCode: deviceCodeStr }),
        });

        const data = await res.json();

        if (data.status === "pending") {
          setTimeout(poll, interval * 1000);
        } else if (data.status === "slow_down") {
          setTimeout(poll, (interval + 5) * 1000);
        } else if (data.connection) {
          setStep("success");
          onSuccess();
          setTimeout(() => onOpenChange(false), 1500);
        } else if (data.error) {
          throw new Error(data.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Polling failed");
        setPolling(false);
      }
    };

    poll();
  };

  const handleExchange = async () => {
    if (!code.trim()) {
      setError("Please paste the authorization code");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/oauth/${provider}/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          codeVerifier,
          state,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Token exchange failed");
      }

      setStep("success");
      onSuccess();
      setTimeout(() => onOpenChange(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Exchange failed");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!code.trim()) {
      setError("Please paste the token");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/oauth/${provider}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: code.trim(),
          name: `${provider}-manual`,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Import failed");
      }

      setStep("success");
      onSuccess();
      setTimeout(() => onOpenChange(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── Openagentic Social Login ───
  const initSocialLogin = async (idp: "Google" | "Github") => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/oauth/kiro/social-login?idp=${idp}`);
      if (!res.ok) throw new Error("Failed to generate social login URL");
      const data = await res.json();
      setAuthUrl(data.authUrl);
      setCodeVerifier(data.codeVerifier);
      setState(data.state);
      setStep("social");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to init social login");
    } finally {
      setLoading(false);
    }
  };

  const handleSocialExchange = async () => {
    if (!code.trim()) {
      setError("Please paste the callback URL or code");
      return;
    }

    setLoading(true);
    setError("");
    try {
      // Extract code from callback URL if full URL pasted
      let extractedCode = code.trim();
      if (extractedCode.includes("code=")) {
        const url = new URL(extractedCode);
        extractedCode = url.searchParams.get("code") || extractedCode;
      }

      const res = await fetch(`/api/oauth/kiro/social-exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: extractedCode,
          codeVerifier,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Social exchange failed");
      }

      setStep("success");
      onSuccess();
      setTimeout(() => onOpenChange(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Exchange failed");
    } finally {
      setLoading(false);
    }
  };

  const handleKiroImport = async () => {
    if (!code.trim()) {
      setError("Please paste your refresh token");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/oauth/kiro/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: code.trim(),
          name: "kiro-imported",
          providerSpecificData: { authMethod: "imported" },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Import failed");
      }

      setStep("success");
      onSuccess();
      setTimeout(() => onOpenChange(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  // Ambil nama tampilan provider dari konstanta bersama.
  // Fallback ke string mentah / "Provider" kalau provider kosong.
  const getProviderName = () =>
    provider ? getOAuthProviderLabel(provider) : "Provider";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Connect {getProviderName()}
          </DialogTitle>
          <DialogDescription>
            {step === "init" && provider === "kiro" && "Choose your login method"}
            {step === "authorize" && "Authorize with your account"}
            {step === "exchange" && "Paste authorization code"}
            {step === "device_code" && "Enter device code"}
            {step === "social" && "Complete social login"}
            {step === "import" && "Import your token"}
            {step === "success" && "Connection successful!"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          {/* Openagentic Method Selection */}
          {step === "init" && provider === "kiro" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Choose how you want to connect to Openagentic:
              </p>
              <div className="grid gap-2">
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-auto py-3"
                  onClick={async () => {
                    setLoading(true);
                    setError("");
                    try {
                      await initDeviceCodeFlow();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Failed");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                >
                  <Shield className="h-4 w-4 shrink-0" />
                  <div className="text-left">
                    <p className="text-sm font-medium">AWS Builder ID</p>
                    <p className="text-xs text-muted-foreground">Device code flow — free tier</p>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-auto py-3"
                  onClick={() => initSocialLogin("Google")}
                  disabled={loading}
                >
                  <ExternalLink className="h-4 w-4 shrink-0" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Google Account</p>
                    <p className="text-xs text-muted-foreground">Social login via Google</p>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-auto py-3"
                  onClick={() => initSocialLogin("Github")}
                  disabled={loading}
                >
                  <ExternalLink className="h-4 w-4 shrink-0" />
                  <div className="text-left">
                    <p className="text-sm font-medium">GitHub Account</p>
                    <p className="text-xs text-muted-foreground">Social login via GitHub</p>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-auto py-3"
                  onClick={() => {
                    setStep("import");
                  }}
                  disabled={loading}
                >
                  <Key className="h-4 w-4 shrink-0" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Import Token</p>
                    <p className="text-xs text-muted-foreground">Paste a refresh token manually</p>
                  </div>
                </Button>
              </div>
              {loading && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Connecting...
                </div>
              )}
            </div>
          )}

          {/* Social Login Flow (Openagentic Google/GitHub) */}
          {step === "social" && (
            <>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  A login page will open. After authorizing, you'll be redirected to a{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">kiro://</code>{" "}
                  URL. Copy that full URL and paste it below.
                </p>
                <Button
                  className="w-full"
                  onClick={() => window.open(authUrl, "_blank")}
                  disabled={!authUrl}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Login Page
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="social-code">Callback URL or Code</Label>
                <Input
                  id="social-code"
                  placeholder="Paste kiro://... URL or code here..."
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  After authorizing, your browser will try to open an <code>kiro://</code> link.
                  Copy the full URL from the address bar and paste it here.
                </p>
              </div>

              <Button
                className="w-full"
                onClick={handleSocialExchange}
                disabled={loading || !code.trim()}
              >
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Connect
              </Button>
            </>
          )}

          {/* Authorization Code Flow */}
          {step === "authorize" && (
            <>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Click the button below to authorize access. You'll be redirected back after authorization.
                </p>
                <Button
                  className="w-full"
                  onClick={() => window.open(authUrl, "_blank")}
                  disabled={!authUrl}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Authorize with {getProviderName()}
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="auth-code">Authorization Code</Label>
                <Input
                  id="auth-code"
                  placeholder="Paste code here..."
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  After authorizing, copy the code from the redirect URL and paste it here.
                </p>
              </div>

              <Button
                className="w-full"
                onClick={handleExchange}
                disabled={loading || !code.trim()}
              >
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Exchange Code
              </Button>
            </>
          )}

          {/* Device Code Flow */}
          {step === "device_code" && deviceCode && (
            <>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Go to the verification URL and enter the code below:
                </p>

                <div className="p-4 rounded-lg bg-muted space-y-3">
                  <div>
                    <Label className="text-xs">Verification URL</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 text-sm font-mono break-all">
                        {deviceCode.verificationUri}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopy(deviceCode.verificationUri)}
                      >
                        {copied ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Device Code</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-2xl font-mono font-bold tracking-wider">
                        {deviceCode.userCode}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopy(deviceCode.userCode)}
                      >
                        {copied ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    window.open(deviceCode.verificationUri, "_blank")
                  }
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Verification Page
                </Button>
              </div>

              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className={`h-4 w-4 ${polling ? "animate-spin" : ""}`} />
                {polling ? "Waiting for authorization..." : "Polling stopped"}
              </div>
            </>
          )}

          {/* Import Token Flow */}
          {step === "import" && (
            <>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {provider === "kiro"
                    ? "Paste your Openagentic refresh token below. Valid tokens start with \"aorAAAAAG\"."
                    : `Paste your ${getProviderName()} token below. This is typically found in your account settings or developer console.`}
                </p>

                <div className="space-y-2">
                  <Label htmlFor="token-input">
                    {provider === "kiro" ? "Refresh Token" : "Token"}
                  </Label>
                  <Input
                    id="token-input"
                    type="password"
                    placeholder={provider === "kiro" ? "aorAAAAAG..." : "Paste token here..."}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              <Button
                className="w-full"
                onClick={provider === "kiro" ? handleKiroImport : handleImport}
                disabled={loading || !code.trim()}
              >
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Import Token
              </Button>
            </>
          )}

          {/* Success */}
          {step === "success" && (
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
                <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-lg font-semibold">Successfully Connected!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your {getProviderName()} account is now linked.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

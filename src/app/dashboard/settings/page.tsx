"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Settings as SettingsIcon,
  Lock,
  Eye,
  EyeOff,
  Server,
  Sparkles,
  Database,
  AlertTriangle,
  Trash2,
  Download,
  Upload,
  Check,
  Copy,
  Info,
  Zap,
  CheckCircle2,
  RefreshCw,
  FileWarning,
  HardDrive,
  Shield,
} from "lucide-react";

// ─────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────

const OPENROUTER_SORT_OPTIONS = [
  { value: "", label: "Default (Load Balanced)", desc: "Weighted by inverse price" },
  { value: "price", label: "Lowest Price", desc: "Cheapest provider, no balancing" },
  { value: "throughput", label: "Highest Throughput", desc: "Fastest tokens/sec" },
  { value: "latency", label: "Lowest Latency", desc: "Fastest response time" },
];

const LOG_RETENTION_OPTIONS = [
  { value: "60", label: "60 days (recommended)" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "1 year" },
  { value: "0", label: "Forever (no auto-cleanup)" },
];

type SectionId =
  | "account"
  | "general"
  | "routing"
  | "token-saver"
  | "storage"
  | "danger";

const SECTIONS: { id: SectionId; label: string; icon: React.ElementType }[] = [
  { id: "account", label: "Account", icon: Lock },
  { id: "general", label: "General", icon: Server },
  { id: "routing", label: "Provider Routing", icon: SettingsIcon },
  { id: "token-saver", label: "Token Saver", icon: Sparkles },
  { id: "storage", label: "Backup & Restore", icon: Database },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle },
];

// ─────────────────────────────────────────────
//  Password Strength
// ─────────────────────────────────────────────

function getPasswordStrength(pw: string): {
  score: number;
  label: string;
  color: string;
} {
  if (pw.length === 0) return { score: 0, label: "—", color: "bg-muted" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong", "Excellent"];
  const colors = [
    "bg-red-500",
    "bg-red-500",
    "bg-amber-500",
    "bg-yellow-500",
    "bg-green-500",
    "bg-green-600",
  ];
  return { score, label: labels[score], color: colors[score] };
}

// ─────────────────────────────────────────────
//  Loading Skeleton
// ─────────────────────────────────────────────

function SettingsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-32 bg-muted rounded" />
        <div className="h-4 w-64 bg-muted rounded" />
      </div>
      <div className="grid lg:grid-cols-[200px_1fr] gap-6">
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-9 bg-muted rounded" />
          ))}
        </div>
        <div className="space-y-4">
          <div className="h-48 bg-muted rounded-lg" />
          <div className="h-48 bg-muted rounded-lg" />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  Section Wrapper
// ─────────────────────────────────────────────

function Section({
  id,
  icon: Icon,
  title,
  description,
  children,
  active,
  variant = "default",
}: {
  id: SectionId;
  icon: React.ElementType;
  title: string;
  description?: string;
  children: React.ReactNode;
  active: SectionId;
  variant?: "default" | "danger";
}) {
  if (active !== id) return null;
  return (
    <Card
      className={
        variant === "danger"
          ? "border-red-300 dark:border-red-800"
          : ""
      }
    >
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon
            className={`h-4 w-4 ${
              variant === "danger" ? "text-red-500" : "text-muted-foreground"
            }`}
          />
          {title}
        </CardTitle>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4 pt-4">{children}</CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────
//  Main Settings Page
// ─────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<SectionId>("account");

  // Password
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Restore
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Backup
  const [backupLoading, setBackupLoading] = useState(false);

  // Reset
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [clearLogsDialogOpen, setClearLogsDialogOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);

  // Routing & retention saving state
  const [savingSetting, setSavingSetting] = useState<string | null>(null);

  // Endpoint
  const endpoint =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.host}/api/v1`
      : "";

  const fetchAll = useCallback(async () => {
    try {
      const settingsRes = await fetch("/api/settings");
      if (settingsRes.ok) setSettings(await settingsRes.json());
    } catch {
      toast.error("Failed to fetch settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ─── Password ───
  async function updatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (newPassword.length < 4) {
      toast.error("Password must be at least 4 characters");
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      if (res.ok) {
        toast.success("Password updated successfully");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast.error("Failed to update password");
      }
    } catch {
      toast.error("Connection error");
    } finally {
      setSavingPassword(false);
    }
  }

  // ─── Generic setting update ───
  async function updateSetting(key: string, value: string, label?: string) {
    setSavingSetting(key);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (res.ok) {
        setSettings((s) => ({ ...s, [key]: value }));
        toast.success(label ? `${label} updated` : "Setting saved");
      } else {
        toast.error("Failed to update setting");
      }
    } catch {
      toast.error("Connection error");
    } finally {
      setSavingSetting(null);
    }
  }

  // ─── Backup ───
  async function downloadBackup() {
    setBackupLoading(true);
    try {
      const res = await fetch("/api/backup");
      if (!res.ok) {
        toast.error("Failed to create backup");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition");
      const filename =
        disposition?.match(/filename="(.+)"/)?.[1] || "wrouter-backup.db";
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Backup downloaded");
    } catch {
      toast.error("Backup failed");
    } finally {
      setBackupLoading(false);
    }
  }

  // ─── Restore ───
  function pickFile() {
    fileInputRef.current?.click();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".db")) {
      setRestoreFile(file);
    } else {
      toast.error("Please drop a .db file");
    }
  }

  async function uploadRestore() {
    if (!restoreFile) return;
    setRestoreLoading(true);
    try {
      const formData = new FormData();
      formData.append("database", restoreFile);
      const res = await fetch("/api/restore", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "Database restored. Reloading...");
        setRestoreFile(null);
        setRestoreDialogOpen(false);
        setTimeout(() => window.location.reload(), 1000);
      } else {
        toast.error(data.error || "Restore failed");
      }
    } catch {
      toast.error("Connection error");
    } finally {
      setRestoreLoading(false);
    }
  }

  // ─── Reset ───
  async function clearLogs() {
    setResetting(true);
    try {
      const res = await fetch("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "logs" }),
      });
      if (res.ok) {
        toast.success("Request logs cleared");
        setClearLogsDialogOpen(false);
      } else {
        toast.error("Failed to clear logs");
      }
    } catch {
      toast.error("Connection error");
    } finally {
      setResetting(false);
    }
  }

  async function factoryReset() {
    setResetting(true);
    try {
      const res = await fetch("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "full" }),
      });
      if (res.ok) {
        toast.success("Factory reset complete");
        setResetDialogOpen(false);
        setResetConfirmText("");
        router.refresh();
      } else {
        toast.error("Factory reset failed");
      }
    } catch {
      toast.error("Connection error");
    } finally {
      setResetting(false);
    }
  }

  if (loading) return <SettingsSkeleton />;

  const passwordStrength = getPasswordStrength(newPassword);
  const passwordMatch =
    confirmPassword.length > 0 && newPassword === confirmPassword;
  const passwordMismatch =
    confirmPassword.length > 0 && newPassword !== confirmPassword;

  return (
    <div className="space-y-6">
      {/* ═══ Header ═══ */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <SettingsIcon className="h-7 w-7" />
          Settings
        </h2>
        <p className="text-muted-foreground mt-1">
          Configure your WRouter instance
        </p>
      </div>

      <div className="grid lg:grid-cols-[220px_1fr] gap-6">
        {/* ═══ Sidebar Navigation ═══ */}
        <nav className="space-y-1 lg:sticky lg:top-4 self-start">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const isActive = activeSection === s.id;
            const isDanger = s.id === "danger";
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSection(s.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? isDanger
                      ? "bg-red-500/10 text-red-600 dark:text-red-400 font-medium"
                      : "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="text-left">{s.label}</span>
              </button>
            );
          })}
        </nav>

        {/* ═══ Section Content ═══ */}
        <div className="space-y-4 min-w-0">
          {/* ─── Account ─── */}
          <Section
            id="account"
            active={activeSection}
            icon={Lock}
            title="Change Password"
            description="Update your dashboard login password"
          >
            <form onSubmit={updatePassword} className="space-y-4 max-w-md">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="pr-10 font-mono"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {/* Password strength indicator */}
                {newPassword.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex gap-1 h-1.5">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={`flex-1 rounded-full ${
                            i < passwordStrength.score
                              ? passwordStrength.color
                              : "bg-muted"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Strength:{" "}
                      <span className="font-medium">{passwordStrength.label}</span>
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className={`pr-10 font-mono ${
                      passwordMismatch
                        ? "border-red-500 focus-visible:ring-red-500"
                        : passwordMatch
                        ? "border-green-500"
                        : ""
                    }`}
                    required
                  />
                  {passwordMatch && (
                    <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                  )}
                </div>
                {passwordMismatch && (
                  <p className="text-xs text-red-500">Passwords do not match</p>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button
                  type="submit"
                  disabled={
                    savingPassword ||
                    !newPassword ||
                    !confirmPassword ||
                    passwordMismatch
                  }
                >
                  {savingPassword ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Update Password"
                  )}
                </Button>
                {(newPassword || confirmPassword) && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </form>
          </Section>

          {/* ─── General / Endpoint Info ─── */}
          <Section
            id="general"
            active={activeSection}
            icon={Server}
            title="Endpoint Information"
            description="Your WRouter API endpoints and connection details"
          >
            <div className="space-y-3">
              {/* Endpoint URL */}
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                  Base URL
                </Label>
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

              {/* API Routes */}
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                  API Routes
                </Label>
                <div className="rounded-md border divide-y">
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="text-[10px] font-mono bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-700"
                      >
                        POST
                      </Badge>
                      <span className="text-sm">Chat Completions</span>
                    </div>
                    <code className="text-xs text-muted-foreground font-mono">
                      /api/v1/chat/completions
                    </code>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="text-[10px] font-mono bg-green-50 text-green-700 border-green-300 dark:bg-green-950/30 dark:text-green-400 dark:border-green-700"
                      >
                        GET
                      </Badge>
                      <span className="text-sm">List Models</span>
                    </div>
                    <code className="text-xs text-muted-foreground font-mono">
                      /api/v1/models
                    </code>
                  </div>
                </div>
              </div>

              {/* Log retention */}
              <div className="pt-3 border-t space-y-1.5">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Log Retention</Label>
                    <p className="text-xs text-muted-foreground">
                      Auto-delete request logs older than this period
                    </p>
                  </div>
                  {savingSetting === "log_retention_days" && (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                </div>
                <Select
                  value={settings.log_retention_days || "60"}
                  onValueChange={(value) =>
                    updateSetting(
                      "log_retention_days",
                      value ?? "60",
                      "Log retention"
                    )
                  }
                >
                  <SelectTrigger className="w-full max-w-xs mt-2">
                    <SelectValue>
                      {(value: string) => {
                        const opt = LOG_RETENTION_OPTIONS.find((o) => o.value === value);
                        return opt?.label || value;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {LOG_RETENTION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Section>

          {/* ─── Provider Routing ─── */}
          <Section
            id="routing"
            active={activeSection}
            icon={SettingsIcon}
            title="Provider Routing"
            description="Control how OpenRouter selects underlying providers for each request"
          >
            <div className="space-y-3">
              <div className="rounded-md bg-muted/30 border p-3 flex items-start gap-2">
                <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  OpenRouter routes each request to one of multiple underlying
                  providers (e.g., DeepSeek, Anthropic) per model. Choose how those
                  providers are selected.
                </p>
              </div>

              <div className="grid gap-2">
                {OPENROUTER_SORT_OPTIONS.map((opt) => {
                  const isActive =
                    (settings.openrouter_provider_sort || "") === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        updateSetting(
                          "openrouter_provider_sort",
                          opt.value,
                          "Provider sort"
                        )
                      }
                      disabled={
                        savingSetting === "openrouter_provider_sort" ||
                        isActive
                      }
                      className={`flex items-center justify-between gap-3 px-4 py-3 rounded-md border text-left transition-all ${
                        isActive
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40 hover:bg-accent/30"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{opt.label}</p>
                          {isActive && (
                            <Badge
                              variant="default"
                              className="text-[9px] px-1.5 py-0 h-4"
                            >
                              ACTIVE
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {opt.desc}
                        </p>
                      </div>
                      {isActive && (
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </Section>

          {/* ─── Token Saver ─── */}
          <Section
            id="token-saver"
            active={activeSection}
            icon={Sparkles}
            title="Token Saver"
            description="Optional features to reduce API token usage"
          >
            <div className="space-y-3">
              {/* RTK */}
              <div className="flex items-center justify-between gap-3 p-4 rounded-md border">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="rounded-md bg-blue-500/10 p-2 shrink-0">
                    <Zap className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">RTK Token Saver</p>
                      {settings.rtk_enabled === "true" && (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0 h-4 border-green-300 text-green-700 dark:border-green-700 dark:text-green-400"
                        >
                          ON
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Compresses tool_result content. Saves 20-40% input tokens
                      with no quality loss.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings.rtk_enabled === "true"}
                  onCheckedChange={(checked) =>
                    updateSetting(
                      "rtk_enabled",
                      checked ? "true" : "false",
                      "RTK"
                    )
                  }
                  disabled={savingSetting === "rtk_enabled"}
                />
              </div>

              {/* Caveman */}
              <div className="flex items-center justify-between gap-3 p-4 rounded-md border">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="rounded-md bg-amber-500/10 p-2 shrink-0">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">Caveman Mode</p>
                      {settings.caveman_enabled === "true" && (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0 h-4 border-green-300 text-green-700 dark:border-green-700 dark:text-green-400"
                        >
                          ON
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Aggressive terse-style output. Saves up to 65% output
                      tokens. May reduce quality.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings.caveman_enabled === "true"}
                  onCheckedChange={(checked) =>
                    updateSetting(
                      "caveman_enabled",
                      checked ? "true" : "false",
                      "Caveman Mode"
                    )
                  }
                  disabled={savingSetting === "caveman_enabled"}
                />
              </div>
            </div>
          </Section>

          {/* ─── Storage / Backup & Restore ─── */}
          <Section
            id="storage"
            active={activeSection}
            icon={Database}
            title="Backup & Restore"
            description="Export your data or restore from a previous backup"
          >
            {/* Backup */}
            <div className="rounded-md border p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-green-500/10 p-2">
                  <Download className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Download Backup</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Export the entire database (providers, API keys, combos, logs,
                    settings) as a single .db file
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={downloadBackup}
                disabled={backupLoading}
              >
                {backupLoading ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />
                    Creating backup...
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Download Backup
                  </>
                )}
              </Button>
            </div>

            {/* Restore */}
            <div className="rounded-md border p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-blue-500/10 p-2">
                  <Upload className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Restore from Backup</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Upload a .db file to replace all current data. Cannot be
                    undone.
                  </p>
                </div>
              </div>

              {/* File drop area */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={pickFile}
                className={`rounded-md border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40 hover:bg-accent/20"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".db"
                  onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                {restoreFile ? (
                  <div className="space-y-1">
                    <HardDrive className="h-6 w-6 text-primary mx-auto" />
                    <p className="text-sm font-medium">{restoreFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(restoreFile.size / 1024).toFixed(1)} KB
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRestoreFile(null);
                      }}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Upload className="h-6 w-6 text-muted-foreground mx-auto" />
                    <p className="text-sm font-medium">
                      Drop .db file here or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Only .db files are accepted
                    </p>
                  </div>
                )}
              </div>

              <Button
                variant="outline"
                disabled={!restoreFile || restoreLoading}
                onClick={() => setRestoreDialogOpen(true)}
              >
                <Upload className="h-3.5 w-3.5 mr-1" />
                Restore Database
              </Button>
            </div>
          </Section>

          {/* ─── Danger Zone ─── */}
          <Section
            id="danger"
            active={activeSection}
            icon={AlertTriangle}
            title="Danger Zone"
            description="Destructive actions. Proceed with caution."
            variant="danger"
          >
            {/* Clear logs */}
            <div className="rounded-md border p-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="rounded-md bg-amber-500/10 p-2 shrink-0">
                  <FileWarning className="h-4 w-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Clear Request Logs</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Delete all request history. Providers, API keys, and combos
                    are kept.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/20 shrink-0"
                onClick={() => setClearLogsDialogOpen(true)}
                disabled={resetting}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Clear Logs
              </Button>
            </div>

            {/* Factory reset */}
            <div className="rounded-md border-2 border-red-300 dark:border-red-800 bg-red-50/30 dark:bg-red-950/10 p-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="rounded-md bg-red-500/10 p-2 shrink-0">
                  <Shield className="h-4 w-4 text-red-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Factory Reset</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Permanently delete <strong>all data</strong>: providers, API
                    keys, combos, and logs. Your password is kept.
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="shrink-0"
                onClick={() => setResetDialogOpen(true)}
                disabled={resetting}
              >
                <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                Factory Reset
              </Button>
            </div>
          </Section>
        </div>
      </div>

      {/* ═══ Restore Confirmation Dialog ═══ */}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Database Restore
            </DialogTitle>
            <DialogDescription>
              This will <strong className="text-foreground">replace ALL current data</strong>{" "}
              (providers, API keys, combos, logs, settings) with the contents of the
              uploaded backup file. The page will reload after restore.
            </DialogDescription>
          </DialogHeader>
          {restoreFile && (
            <div className="rounded-md bg-muted px-3 py-2 text-xs font-mono flex items-center gap-2">
              <HardDrive className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{restoreFile.name}</span>
              <span className="text-muted-foreground shrink-0">
                ({(restoreFile.size / 1024).toFixed(1)} KB)
              </span>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRestoreDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={restoreLoading}
              onClick={uploadRestore}
            >
              {restoreLoading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />
                  Restoring...
                </>
              ) : (
                "Confirm Restore"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Clear Logs Dialog ═══ */}
      <Dialog open={clearLogsDialogOpen} onOpenChange={setClearLogsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileWarning className="h-5 w-5 text-amber-500" />
              Clear Request Logs
            </DialogTitle>
            <DialogDescription>
              All request history will be deleted permanently. Providers, API
              keys, and combos are kept. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setClearLogsDialogOpen(false)}
              disabled={resetting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={clearLogs}
              disabled={resetting}
            >
              {resetting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />
                  Clearing...
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Clear All Logs
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Factory Reset Dialog ═══ */}
      <Dialog
        open={resetDialogOpen}
        onOpenChange={(v) => {
          setResetDialogOpen(v);
          if (!v) setResetConfirmText("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-red-500" />
              Factory Reset
            </DialogTitle>
            <DialogDescription>
              This will permanently delete all{" "}
              <strong className="text-foreground">providers</strong>,{" "}
              <strong className="text-foreground">API keys</strong>,{" "}
              <strong className="text-foreground">combos</strong>, and{" "}
              <strong className="text-foreground">request logs</strong>. Your
              login password will not be changed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirmReset">
              Type{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                RESET
              </code>{" "}
              to confirm
            </Label>
            <Input
              id="confirmReset"
              placeholder="RESET"
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              className="font-mono"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={resetConfirmText !== "RESET" || resetting}
              onClick={factoryReset}
            >
              {resetting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />
                  Resetting...
                </>
              ) : (
                "Reset Everything"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

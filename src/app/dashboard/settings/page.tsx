"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    try {
      const settingsRes = await fetch("/api/settings");
      if (settingsRes.ok) setSettings(await settingsRes.json());
    } catch {
      toast.error("Failed to fetch settings");
    } finally {
      setLoading(false);
    }
  }

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

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });

      if (res.ok) {
        toast.success("Password updated");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast.error("Failed to update password");
      }
    } catch {
      toast.error("Connection error");
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-muted-foreground gap-2"><div className="w-4 h-4 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" /><span className="text-sm">Loading settings...</span></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground mt-1">
          Configure your WRouter instance
        </p>
      </div>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={updatePassword} className="space-y-4 max-w-sm">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
              />
            </div>
            <Button type="submit">Update Password</Button>
          </form>
        </CardContent>
      </Card>

      {/* Endpoint Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Endpoint Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Chat Completions</span>
              <code className="font-mono text-xs">POST /api/v1/chat/completions</code>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">List Models</span>
              <code className="font-mono text-xs">GET /api/v1/models</code>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Port</span>
              <span>{settings.port || "20128"}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Reset Logs */}
          <div className="flex items-center justify-between rounded-md border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Clear Request Logs</p>
              <p className="text-xs text-muted-foreground">Delete all request history. Providers and API keys are kept.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/40 hover:bg-destructive/10 shrink-0"
              onClick={async () => {
                if (!confirm("Clear all request logs? This cannot be undone.")) return;
                setResetting(true);
                try {
                  const res = await fetch("/api/reset", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ type: "logs" }),
                  });
                  if (res.ok) {
                    toast.success("Request logs cleared");
                  } else {
                    toast.error("Failed to clear logs");
                  }
                } catch {
                  toast.error("Connection error");
                } finally {
                  setResetting(false);
                }
              }}
              disabled={resetting}
            >
              Clear Logs
            </Button>
          </div>

          {/* Full Reset */}
          <div className="flex items-center justify-between rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Factory Reset</p>
              <p className="text-xs text-muted-foreground">Delete all data: logs, providers, API keys, and combos. Your password is kept.</p>
            </div>
            <Dialog open={resetDialogOpen} onOpenChange={(v) => { setResetDialogOpen(v); setResetConfirmText(""); }}>
              <DialogTrigger render={<Button variant="destructive" size="sm" className="shrink-0" disabled={resetting} />}>
                Factory Reset
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Confirm Factory Reset</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    This will permanently delete all <strong>providers</strong>, <strong>API keys</strong>, <strong>combos</strong>, and <strong>request logs</strong>. Your login password will not be changed.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="confirmReset">Type <code className="bg-muted px-1 rounded text-xs">RESET</code> to confirm</Label>
                    <Input
                      id="confirmReset"
                      placeholder="RESET"
                      value={resetConfirmText}
                      onChange={(e) => setResetConfirmText(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setResetDialogOpen(false)}>Cancel</Button>
                    <Button
                      variant="destructive"
                      disabled={resetConfirmText !== "RESET" || resetting}
                      onClick={async () => {
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
                            router.refresh();
                          } else {
                            toast.error("Factory reset failed");
                          }
                        } catch {
                          toast.error("Connection error");
                        } finally {
                          setResetting(false);
                        }
                      }}
                    >
                      {resetting ? "Resetting..." : "Reset Everything"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

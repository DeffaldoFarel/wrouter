"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  RefreshCw,
  Link2,
  Unlink,
  Shield,
  Key,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";
import { OAuthFlowModal } from "./oauth-flow-modal";
import { getOAuthProviderLabel } from "@/lib/constants/oauth-providers";

interface OAuthConnection {
  id: string;
  provider: string;
  name: string;
  email: string | null;
  authType: "oauth" | "apikey" | "access_token";
  isActive: boolean;
  priority: number;
  testStatus: "untested" | "active" | "error" | "expired";
  expiresAt: string | null;
  lastRefreshAt: string | null;
  lastError: string | null;
  createdAt: string;
}

interface ConnectionManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterProvider?: string | null;
}

export function OAuthConnectionManager({ open, onOpenChange, filterProvider }: ConnectionManagerProps) {
  const [connections, setConnections] = useState<OAuthConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [oauthModalOpen, setOauthModalOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Ambil label provider dari konstanta bersama.
  const getProviderLabel = (provider: string) => getOAuthProviderLabel(provider);

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/oauth/connections");
      if (!res.ok) throw new Error("Failed to fetch connections");
      const data = await res.json();
      setConnections(data.connections || []);
    } catch (err) {
      toast.error("Failed to load OAuth connections");
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchConnections();
      // Auto-set selected provider from filter
      if (filterProvider) {
        setSelectedProvider(filterProvider);
      }
    }
  }, [open, fetchConnections, filterProvider]);

  // Filter connections by provider if filterProvider is set
  const displayedConnections = filterProvider
    ? connections.filter((c) => c.provider === filterProvider)
    : connections;

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/oauth/connections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Failed to update");
      setConnections((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isActive } : c))
      );
      toast.success(isActive ? "Connection enabled" : "Connection disabled");
    } catch {
      toast.error("Failed to update connection");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/oauth/connections/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      setConnections((prev) => prev.filter((c) => c.id !== id));
      toast.success("Connection deleted");
    } catch {
      toast.error("Failed to delete connection");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    setDeleteTargetId(null);
    await handleDelete(id);
  };

  const handleRefresh = async (id: string) => {
    try {
      const res = await fetch(`/api/oauth/connections/${id}/refresh`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to refresh");
      await fetchConnections();
      toast.success("Token refreshed");
    } catch (err) {
      toast.error("Failed to refresh token");
    }
  };

  const handleNewConnection = (provider: string) => {
    setSelectedProvider(provider);
    setOauthModalOpen(true);
  };

  const handleOAuthSuccess = () => {
    fetchConnections();
    toast.success("OAuth connection added!");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {filterProvider ? `${getProviderLabel(filterProvider)} Connections` : "OAuth Connections"}
            </DialogTitle>
            <DialogDescription>
              {filterProvider
                ? `Manage your ${getProviderLabel(filterProvider)} OAuth connections.`
                : "Manage OAuth accounts for Claude Code, Codex, GitHub Copilot, and more."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Quick Add Button */}
            <div className="flex flex-wrap gap-2">
              {filterProvider ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleNewConnection(filterProvider)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add {getProviderLabel(filterProvider)} Connection
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleNewConnection("claude")}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Claude Code
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleNewConnection("codex")}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    OpenAI Codex
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleNewConnection("github")}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    GitHub Copilot
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleNewConnection("cursor")}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Cursor
                  </Button>
                </>
              )}
            </div>

            {/* Connections Table */}
            {displayedConnections.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Link2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No {filterProvider ? getProviderLabel(filterProvider) : "OAuth"} connections yet.</p>
                <p className="text-sm">Click the button above to add one.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {!filterProvider && <TableHead>Provider</TableHead>}
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedConnections.map((conn) => (
                    <TableRow key={conn.id}>
                      {!filterProvider && (
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {conn.provider}
                          </Badge>
                        </TableCell>
                      )}
                      <TableCell className="font-medium">{conn.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {conn.email || "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={conn.testStatus} isActive={conn.isActive} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {conn.expiresAt ? formatExpiry(conn.expiresAt) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Switch
                            checked={conn.isActive}
                            onCheckedChange={(checked) =>
                              handleToggle(conn.id, checked)
                            }
                          />
                          {conn.authType === "oauth" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRefresh(conn.id)}
                              title="Refresh token"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTargetId(conn.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <OAuthFlowModal
        open={oauthModalOpen}
        onOpenChange={setOauthModalOpen}
        provider={selectedProvider}
        onSuccess={handleOAuthSuccess}
      />

      {/* Delete OAuth Connection Confirmation Dialog */}
      <Dialog
        open={!!deleteTargetId}
        onOpenChange={(open) => !open && setDeleteTargetId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Hapus Koneksi OAuth
            </DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin menghapus koneksi OAuth ini? Tindakan ini
              tidak dapat dibatalkan dan permintaan yang menggunakan koneksi
              ini akan gagal.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTargetId(null)}
            >
              Batal
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Hapus Koneksi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Helper Components ───

function StatusBadge({
  status,
  isActive,
}: {
  status: string;
  isActive: boolean;
}) {
  if (!isActive) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Unlink className="h-3 w-3" />
        Disabled
      </Badge>
    );
  }

  switch (status) {
    case "active":
      return (
        <Badge variant="default" className="gap-1 bg-green-600">
          <CheckCircle2 className="h-3 w-3" />
          Active
        </Badge>
      );
    case "error":
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Error
        </Badge>
      );
    case "expired":
      return (
        <Badge variant="secondary" className="gap-1">
          <Clock className="h-3 w-3" />
          Expired
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="gap-1">
          <Key className="h-3 w-3" />
          Untested
        </Badge>
      );
  }
}

function formatExpiry(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (diff < 0) return "Expired";
  if (minutes < 60) return `${minutes}m left`;
  if (hours < 24) return `${hours}h left`;
  return `${days}d left`;
}

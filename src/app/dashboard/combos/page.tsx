"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
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
import {
  Layers,
  Plus,
  Search,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  X,
  GripVertical,
  Box,
  Workflow,
  CheckCircle2,
  ArrowRight,
  Copy,
  AlertCircle,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import {
  ProviderIcon,
  KNOWN_ICON_PREFIXES,
} from "@/components/provider-icons";

interface Provider {
  id: string;
  name: string;
  prefix: string;
  models: string[];
  enabled: boolean;
}

interface ComboModel {
  model: string;
  providerId: string;
  priority: number;
}

interface Combo {
  id: string;
  name: string;
  slug: string;
  models: ComboModel[];
  enabled: boolean;
  createdAt: string;
}

// ─────────────────────────────────────────────
//  Brand Icon (same pattern as Providers page)
// ─────────────────────────────────────────────

function BrandIcon({ prefix, size = "sm" }: { prefix?: string; size?: "xs" | "sm" }) {
  const box = size === "xs" ? "h-5 w-5" : "h-6 w-6";
  const iconSize = size === "xs" ? 16 : 20;

  const hasIcon = prefix ? KNOWN_ICON_PREFIXES.has(prefix) : false;

  if (hasIcon) {
    return (
      <div className={`flex items-center justify-center rounded shrink-0 bg-muted/50 border ${box}`}>
        <ProviderIcon prefix={prefix} size={iconSize} />
      </div>
    );
  }
  return (
    <div className={`flex items-center justify-center rounded shrink-0 bg-muted ${box}`}>
      <Box className="h-3 w-3 text-muted-foreground" />
    </div>
  );
}

// ─────────────────────────────────────────────
//  Stat Card
// ─────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent = "default",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  hint?: string;
  accent?: "default" | "success" | "warning";
}) {
  const accentClass = {
    default: "text-foreground",
    success: "text-green-600 dark:text-green-400",
    warning: "text-amber-600 dark:text-amber-400",
  }[accent];

  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
              {label}
            </p>
            <p className={`text-2xl font-bold tabular-nums ${accentClass}`}>{value}</p>
            {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
          </div>
          <div className={`rounded-md bg-muted p-2 ${accentClass}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────
//  Combo Card
// ─────────────────────────────────────────────

function ComboCard({
  combo,
  providers,
  onToggle,
  onEdit,
  onDelete,
}: {
  combo: Combo;
  providers: Provider[];
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (combo: Combo) => void;
  onDelete: (combo: Combo) => void;
}) {
  const sortedModels = [...combo.models].sort((a, b) => a.priority - b.priority);
  const getProvider = (id: string) => providers.find((p) => p.id === id);

  const fullSlug = combo.slug;

  return (
    <Card className="group transition-all hover:shadow-md hover:border-primary/40">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Workflow className="h-4 w-4 text-primary shrink-0" />
              <CardTitle className="truncate">{combo.name}</CardTitle>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <code className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono">
                {fullSlug}
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(combo.slug);
                  toast.success("Slug copied");
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Copy slug"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          </div>
          <Switch
            checked={combo.enabled}
            onCheckedChange={(checked) => onToggle(combo.id, checked)}
            className="scale-90 shrink-0"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Fallback chain visualization */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
              Fallback Chain
            </p>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
              {combo.models.length} model{combo.models.length !== 1 ? "s" : ""}
            </Badge>
          </div>
          {combo.models.length === 0 ? (
            <div className="text-xs text-muted-foreground py-3 text-center border rounded-md border-dashed">
              No models in fallback chain
            </div>
          ) : (
            <div className="space-y-1">
              {sortedModels.slice(0, 5).map((entry, i) => {
                const provider = getProvider(entry.providerId);
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30 text-xs"
                  >
                    <Badge
                      variant="outline"
                      className="text-[10px] w-5 h-5 flex items-center justify-center p-0 shrink-0 font-bold"
                    >
                      {entry.priority}
                    </Badge>
                    <BrandIcon prefix={provider?.prefix} size="xs" />
                    <span className="truncate font-mono">{entry.model}</span>
                    {provider && (
                      <span className="text-muted-foreground text-[10px] ml-auto truncate">
                        {provider.name}
                      </span>
                    )}
                  </div>
                );
              })}
              {sortedModels.length > 5 && (
                <p className="text-[10px] text-muted-foreground text-center pt-1">
                  + {sortedModels.length - 5} more model{sortedModels.length - 5 !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 pt-2 border-t">
          <Button size="sm" variant="ghost" className="flex-1" onClick={() => onEdit(combo)}>
            <Pencil className="h-3.5 w-3.5 mr-1" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Delete combo"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => onDelete(combo)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────
//  Loading Skeleton
// ─────────────────────────────────────────────

function CombosSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-32 bg-muted rounded" />
          <div className="h-4 w-64 bg-muted rounded" />
        </div>
        <div className="h-9 w-32 bg-muted rounded" />
      </div>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 bg-muted rounded-lg" />
        ))}
      </div>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-48 bg-muted rounded-lg" />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  Main Combos Page
// ─────────────────────────────────────────────

export default function CombosPage() {
  const [combos, setCombos] = useState<Combo[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addModelsDialogOpen, setAddModelsDialogOpen] = useState(false);
  const [editingCombo, setEditingCombo] = useState<Combo | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [comboModels, setComboModels] = useState<ComboModel[]>([]);

  // Add Models dialog
  const [tempSelectedModels, setTempSelectedModels] = useState<ComboModel[]>([]);
  const [modelDialogSearch, setModelDialogSearch] = useState("");

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Combo | null>(null);

  // Drag state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const refetch = useCallback(async () => {
    try {
      const [combosRes, providersRes] = await Promise.all([
        fetch("/api/combos"),
        fetch("/api/providers"),
      ]);
      if (combosRes.ok) setCombos(await combosRes.json());
      if (providersRes.ok) setProviders(await providersRes.json());
    } catch {
      toast.error("Failed to fetch data");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [combosRes, providersRes] = await Promise.all([
          fetch("/api/combos"),
          fetch("/api/providers"),
        ]);
        if (cancelled) return;
        if (combosRes.ok) setCombos(await combosRes.json());
        if (providersRes.ok) setProviders(await providersRes.json());
      } catch {
        if (!cancelled) toast.error("Failed to fetch data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function resetForm() {
    setName("");
    setSlug("");
    setComboModels([]);
    setEditingCombo(null);
    setTempSelectedModels([]);
    setModelDialogSearch("");
  }

  function openAddDialog() {
    resetForm();
    setDialogOpen(true);
  }

  function openEditDialog(combo: Combo) {
    setEditingCombo(combo);
    setName(combo.name);
    setSlug(combo.slug);
    setComboModels([...combo.models].sort((a, b) => a.priority - b.priority));
    setDialogOpen(true);
  }

  function openAddModelsDialog() {
    setTempSelectedModels([...comboModels]);
    setModelDialogSearch("");
    setAddModelsDialogOpen(true);
  }

  function toggleModelInTemp(providerId: string, model: string) {
    const exists = tempSelectedModels.some(
      (m) => m.providerId === providerId && m.model === model
    );
    if (exists) {
      const updated = tempSelectedModels.filter(
        (m) => !(m.providerId === providerId && m.model === model)
      );
      setTempSelectedModels(updated.map((m, i) => ({ ...m, priority: i + 1 })));
    } else {
      setTempSelectedModels([
        ...tempSelectedModels,
        { model, providerId, priority: tempSelectedModels.length + 1 },
      ]);
    }
  }

  function saveModelsFromDialog() {
    setComboModels(tempSelectedModels);
    setAddModelsDialogOpen(false);
    toast.success(`${tempSelectedModels.length} model(s) selected`);
  }

  function removeModelFromCombo(index: number) {
    const updated = comboModels.filter((_, i) => i !== index);
    setComboModels(updated.map((m, i) => ({ ...m, priority: i + 1 })));
  }

  function moveModel(index: number, direction: "up" | "down") {
    const newModels = [...comboModels];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newModels.length) return;
    [newModels[index], newModels[targetIndex]] = [newModels[targetIndex], newModels[index]];
    setComboModels(newModels.map((m, i) => ({ ...m, priority: i + 1 })));
  }

  // Drag-and-drop handlers
  function handleDragStart(index: number) {
    setDraggedIndex(index);
  }
  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    const newModels = [...comboModels];
    const [draggedItem] = newModels.splice(draggedIndex, 1);
    newModels.splice(index, 0, draggedItem);
    setComboModels(newModels.map((m, i) => ({ ...m, priority: i + 1 })));
    setDraggedIndex(index);
  }
  function handleDragEnd() {
    setDraggedIndex(null);
  }

  function getProvider(providerId: string): Provider | undefined {
    return providers.find((p) => p.id === providerId);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (comboModels.length === 0) {
      toast.error("Add at least one model to the combo");
      return;
    }
    const payload = { name, slug, models: comboModels };
    try {
      if (editingCombo) {
        const res = await fetch(`/api/combos/${editingCombo.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) toast.success("Combo updated");
        else {
          const data = await res.json();
          toast.error(data.error || "Failed to update combo");
          return;
        }
      } else {
        const res = await fetch("/api/combos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) toast.success("Combo created");
        else {
          const data = await res.json();
          toast.error(data.error || "Failed to create combo");
          return;
        }
      }
      setDialogOpen(false);
      resetForm();
      refetch();
    } catch {
      toast.error("Connection error");
    }
  }

  async function toggleCombo(id: string, enabled: boolean) {
    try {
      const res = await fetch(`/api/combos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to update combo");
        return;
      }
      setCombos((prev) => prev.map((c) => (c.id === id ? { ...c, enabled } : c)));
      toast.success(enabled ? "Combo enabled" : "Combo disabled");
    } catch {
      toast.error("Failed to update combo");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/combos/${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Combo deleted");
        refetch();
      } else {
        toast.error("Failed to delete combo");
      }
    } catch {
      toast.error("Failed to delete combo");
    } finally {
      setDeleteTarget(null);
    }
  }

  // ─── Derived data ───
  const totalActive = combos.filter((c) => c.enabled).length;
  const totalModelsInCombos = combos.reduce((sum, c) => sum + c.models.length, 0);
  const avgChainLength =
    combos.length > 0 ? Math.round(totalModelsInCombos / combos.length) : 0;

  const filteredCombos = useMemo(() => {
    if (!searchQuery.trim()) return combos;
    const q = searchQuery.toLowerCase();
    return combos.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        c.models.some((m) => m.model.toLowerCase().includes(q))
    );
  }, [combos, searchQuery]);

  // Filter providers/models in Add Models dialog
  const filteredProvidersForDialog = useMemo(() => {
    const enabled = providers.filter((p) => p.enabled && p.models.length > 0);
    if (!modelDialogSearch.trim()) return enabled;
    const q = modelDialogSearch.toLowerCase();
    return enabled
      .map((p) => ({
        ...p,
        models: p.models.filter((m) => m.toLowerCase().includes(q)),
      }))
      .filter((p) => p.models.length > 0 || p.name.toLowerCase().includes(q));
  }, [providers, modelDialogSearch]);

  if (loading) return <CombosSkeleton />;

  const enabledProviders = providers.filter((p) => p.enabled);
  const hasActiveProviders = enabledProviders.length > 0;
  const slugPreview = slug || "your-slug";

  return (
    <div className="space-y-6">
      {/* ═══ Header ═══ */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Combos</h2>
          <p className="text-muted-foreground mt-1">
            Create model fallback chains with automatic failover across providers
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button onClick={openAddDialog} disabled={!hasActiveProviders}>
                <Plus className="h-4 w-4 mr-1" />
                Create Combo
              </Button>
            }
          />
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Workflow className="h-5 w-5" />
                {editingCombo ? "Edit Combo" : "Create Combo"}
              </DialogTitle>
              <DialogDescription>
                Combos let you chain multiple models with automatic failover. If the first
                model fails, the next is tried automatically.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={handleSubmit}
              className="flex-1 overflow-hidden flex flex-col gap-4"
            >
              {/* Name + Slug */}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="combo-name">Display Name</Label>
                  <Input
                    id="combo-name"
                    placeholder="e.g. Main Fallback"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="combo-slug">Slug</Label>
                  <Input
                    id="combo-slug"
                    placeholder="e.g. main"
                    value={slug}
                    onChange={(e) =>
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
                    }
                    required
                  />
                </div>
              </div>

              {/* Slug preview */}
              <div className="rounded-md bg-muted/30 border px-3 py-2 text-xs space-y-1">
                <p className="text-muted-foreground">Use this combo in API requests:</p>
                <code className="font-mono text-foreground/80">
                  &quot;model&quot;: &quot;{slugPreview}&quot;
                </code>
              </div>

              {/* Selected Models (Fallback Order) */}
              <div className="flex-1 overflow-hidden flex flex-col space-y-2 min-h-0">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    Fallback Order
                    <Badge variant="secondary" className="text-[10px]">
                      {comboModels.length} model{comboModels.length !== 1 ? "s" : ""}
                    </Badge>
                  </Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={openAddModelsDialog}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Models
                  </Button>
                </div>
                {comboModels.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Drag to reorder. Higher priority = tried first.
                  </p>
                )}
                {comboModels.length > 0 ? (
                  <div className="flex-1 overflow-y-auto border rounded-md p-2 space-y-1.5 min-h-0">
                    {comboModels.map((entry, index) => {
                      const provider = getProvider(entry.providerId);
                      const isDragging = draggedIndex === index;
                      return (
                        <div
                          key={`${entry.providerId}-${entry.model}-${index}`}
                          draggable
                          onDragStart={() => handleDragStart(index)}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDragEnd={handleDragEnd}
                          className={`flex items-center gap-2 rounded-md border px-2 py-2 text-sm bg-background transition-all ${
                            isDragging
                              ? "opacity-50 border-primary"
                              : "hover:bg-muted/30"
                          }`}
                        >
                          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab active:cursor-grabbing" />
                          <Badge
                            variant="default"
                            className="text-[10px] w-5 h-5 flex items-center justify-center p-0 shrink-0 font-bold"
                          >
                            {entry.priority}
                          </Badge>
                          <BrandIcon prefix={provider?.prefix} size="xs" />
                          <span className="font-mono text-xs truncate flex-1">
                            {entry.model}
                          </span>
                          <span className="text-[10px] text-muted-foreground hidden sm:inline truncate max-w-[100px]">
                            {provider?.name || "Unknown"}
                          </span>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => moveModel(index, "up")}
                              disabled={index === 0}
                              className="h-6 w-6 p-0"
                              title="Move up"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => moveModel(index, "down")}
                              disabled={index === comboModels.length - 1}
                              className="h-6 w-6 p-0"
                              title="Move down"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive h-6 w-6 p-0"
                              onClick={() => removeModelFromCombo(index)}
                              title="Remove"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex-1 border-2 border-dashed rounded-md p-8 text-center space-y-2 flex flex-col items-center justify-center min-h-[150px]">
                    <Box className="h-8 w-8 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">No models yet</p>
                      <p className="text-xs text-muted-foreground">
                        Click <strong>Add Models</strong> to start building your fallback chain
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={comboModels.length === 0}>
                  {editingCombo ? "Update Combo" : "Create Combo"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Add Models Dialog */}
        <Dialog open={addModelsDialogOpen} onOpenChange={setAddModelsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Select Models</DialogTitle>
              <DialogDescription>
                Choose which models should be in this combo. Selection order determines
                priority — first selected is tried first.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-hidden flex flex-col gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search by model or provider..."
                  value={modelDialogSearch}
                  onChange={(e) => setModelDialogSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Selected count + clear */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  <strong className="text-foreground">{tempSelectedModels.length}</strong>{" "}
                  selected
                </span>
                {tempSelectedModels.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setTempSelectedModels([])}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {/* Model list grouped by provider */}
              <div className="flex-1 overflow-y-auto border rounded-md p-3 space-y-3 min-h-0">
                {filteredProvidersForDialog.length === 0 ? (
                  <div className="py-8 text-center space-y-2">
                    {modelDialogSearch ? (
                      <>
                        <Search className="h-8 w-8 text-muted-foreground mx-auto" />
                        <p className="text-sm text-muted-foreground">
                          No models match &quot;{modelDialogSearch}&quot;
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No active providers with models. Add and enable providers first.
                      </p>
                    )}
                  </div>
                ) : (
                  filteredProvidersForDialog.map((provider) => {
                    const providerSelectedCount = tempSelectedModels.filter(
                      (m) => m.providerId === provider.id
                    ).length;
                    return (
                      <div key={provider.id} className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <BrandIcon prefix={provider.prefix} size="xs" />
                          <span className="text-xs font-semibold uppercase tracking-wide">
                            {provider.name}
                          </span>
                          {providerSelectedCount > 0 && (
                            <Badge
                              variant="default"
                              className="text-[9px] px-1.5 py-0 h-4"
                            >
                              {providerSelectedCount}
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {provider.models.length} model
                            {provider.models.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {provider.models.map((model) => {
                            const selectedEntry = tempSelectedModels.find(
                              (m) => m.providerId === provider.id && m.model === model
                            );
                            const isSelected = !!selectedEntry;
                            return (
                              <label
                                key={`${provider.id}/${model}`}
                                className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                                  isSelected
                                    ? "bg-primary/10 border border-primary/30"
                                    : "hover:bg-muted/50 border border-transparent"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() =>
                                    toggleModelInTemp(provider.id, model)
                                  }
                                  className="rounded shrink-0"
                                />
                                <span
                                  className="text-xs flex-1 truncate font-mono"
                                  title={model}
                                >
                                  {model}
                                </span>
                                {isSelected && (
                                  <Badge
                                    variant="default"
                                    className="text-[9px] w-4 h-4 flex items-center justify-center p-0 shrink-0"
                                  >
                                    {selectedEntry.priority}
                                  </Badge>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddModelsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" onClick={saveModelsFromDialog}>
                Save Selection ({tempSelectedModels.length})
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                Delete Combo
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to delete{" "}
                <strong className="text-foreground">{deleteTarget?.name}</strong>? This
                will remove the combo and any API requests using its slug will fail.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                Delete Combo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* ═══ Active providers warning ═══ */}
      {!hasActiveProviders && (
        <Card className="border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent>
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium">No active providers</p>
                <p className="text-xs text-muted-foreground mt-1">
                  You need at least one active provider with models to create combos.{" "}
                  <Link
                    href="/dashboard/providers"
                    className="text-primary hover:underline font-medium"
                  >
                    Manage providers →
                  </Link>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ Stats Overview ═══ */}
      {combos.length > 0 && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Layers}
            label="Total Combos"
            value={combos.length}
            hint={`${totalActive} active`}
          />
          <StatCard
            icon={CheckCircle2}
            label="Active"
            value={totalActive}
            hint={
              totalActive === combos.length
                ? "All enabled"
                : `${combos.length - totalActive} disabled`
            }
            accent={totalActive > 0 ? "success" : "default"}
          />
          <StatCard
            icon={Box}
            label="Total Models"
            value={totalModelsInCombos}
            hint="Across all chains"
          />
          <StatCard
            icon={Workflow}
            label="Avg Chain Length"
            value={avgChainLength}
            hint="Models per combo"
          />
        </div>
      )}

      {/* ═══ Search Bar ═══ */}
      {combos.length > 0 && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search combos by name, slug, or model..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <XCircle className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* ═══ Combo List ═══ */}
      {combos.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent>
            <div className="py-12 text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Workflow className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">No combos yet</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Combos let you chain multiple models with automatic failover. If your
                  primary model goes down, requests automatically route to backups.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button onClick={openAddDialog} disabled={!hasActiveProviders}>
                  <Plus className="h-4 w-4 mr-1" />
                  Create Your First Combo
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : filteredCombos.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8 border rounded-md border-dashed">
          No combos match &quot;{searchQuery}&quot;
        </p>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCombos.map((combo) => (
            <ComboCard
              key={combo.id}
              combo={combo}
              providers={providers}
              onToggle={toggleCombo}
              onEdit={openEditDialog}
              onDelete={(c) => setDeleteTarget(c)}
            />
          ))}
        </div>
      )}

      {/* ═══ Help Footer ═══ */}
      {combos.length > 0 && (
        <div className="border-t pt-4 mt-8">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ArrowRight className="h-3 w-3" />
            <span>
              Use a combo by sending its slug as the model field, e.g.{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded">
                my-combo
              </code>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

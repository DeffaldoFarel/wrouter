"use client";

import { useEffect, useState } from "react";
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

interface Provider {
  id: string;
  name: string;
  models: string[];
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

export default function CombosPage() {
  const [combos, setCombos] = useState<Combo[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addModelsDialogOpen, setAddModelsDialogOpen] = useState(false);
  const [editingCombo, setEditingCombo] = useState<Combo | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [comboModels, setComboModels] = useState<ComboModel[]>([]);
  
  // Temp state for add models dialog
  const [tempSelectedModels, setTempSelectedModels] = useState<ComboModel[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [combosRes, providersRes] = await Promise.all([
        fetch("/api/combos"),
        fetch("/api/providers"),
      ]);
      if (combosRes.ok) setCombos(await combosRes.json());
      if (providersRes.ok) setProviders(await providersRes.json());
    } catch {
      toast.error("Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setName("");
    setSlug("");
    setComboModels([]);
    setEditingCombo(null);
    setTempSelectedModels([]);
  }

  function openAddDialog() {
    resetForm();
    setDialogOpen(true);
  }

  function openEditDialog(combo: Combo) {
    setEditingCombo(combo);
    setName(combo.name);
    setSlug(combo.slug);
    setComboModels(combo.models);
    setDialogOpen(true);
  }

  function openAddModelsDialog() {
    // Initialize temp selection with current combo models
    setTempSelectedModels([...comboModels]);
    setAddModelsDialogOpen(true);
  }

  function toggleModelInTemp(providerId: string, model: string) {
    const exists = tempSelectedModels.some(
      (m) => m.providerId === providerId && m.model === model
    );

    if (exists) {
      // Remove from temp
      const updated = tempSelectedModels.filter(
        (m) => !(m.providerId === providerId && m.model === model)
      );
      const reprioritized = updated.map((m, i) => ({ ...m, priority: i + 1 }));
      setTempSelectedModels(reprioritized);
    } else {
      // Add to temp
      const newEntry: ComboModel = {
        model,
        providerId,
        priority: tempSelectedModels.length + 1,
      };
      setTempSelectedModels([...tempSelectedModels, newEntry]);
    }
  }

  function saveModelsFromDialog() {
    setComboModels(tempSelectedModels);
    setAddModelsDialogOpen(false);
  }

  function removeModelFromCombo(index: number) {
    const updated = comboModels.filter((_, i) => i !== index);
    const reprioritized = updated.map((m, i) => ({ ...m, priority: i + 1 }));
    setComboModels(reprioritized);
  }

  function moveModel(index: number, direction: "up" | "down") {
    const newModels = [...comboModels];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newModels.length) return;

    [newModels[index], newModels[targetIndex]] = [newModels[targetIndex], newModels[index]];
    const reprioritized = newModels.map((m, i) => ({ ...m, priority: i + 1 }));
    setComboModels(reprioritized);
  }

  function getProviderName(providerId: string): string {
    return providers.find((p) => p.id === providerId)?.name || "Unknown";
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
        if (res.ok) {
          toast.success("Combo updated");
        } else {
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
        if (res.ok) {
          toast.success("Combo created");
        } else {
          const data = await res.json();
          toast.error(data.error || "Failed to create combo");
          return;
        }
      }

      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch {
      toast.error("Connection error");
    }
  }

  async function toggleCombo(id: string, enabled: boolean) {
    try {
      await fetch(`/api/combos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      fetchData();
    } catch {
      toast.error("Failed to update combo");
    }
  }

  async function deleteCombo(id: string) {
    if (!confirm("Are you sure you want to delete this combo?")) return;

    try {
      const res = await fetch(`/api/combos/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Combo deleted");
        fetchData();
      }
    } catch {
      toast.error("Failed to delete combo");
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-muted-foreground gap-2"><div className="w-4 h-4 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" /><span className="text-sm">Loading combos...</span></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Combos</h2>
          <p className="text-muted-foreground mt-1">
            Create model fallback chains from multiple providers
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button onClick={openAddDialog} />}>
            Create Combo
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>
                {editingCombo ? "Edit Combo" : "Create Combo"}
              </DialogTitle>
              <DialogDescription>
                Create fallback chains with multiple models from different providers.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col gap-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="combo-name">Name</Label>
                  <Input
                    id="combo-name"
                    placeholder="e.g. Main Fallback"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="combo-slug">
                    Slug (used in model name: slug/model)
                  </Label>
                  <Input
                    id="combo-slug"
                    placeholder="e.g. main"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                    required
                  />
                </div>
              </div>

              {/* Selected Models (Fallback Order) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Fallback Order ({comboModels.length} models)</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={openAddModelsDialog}
                  >
                    Add Models
                  </Button>
                </div>
                {comboModels.length > 0 ? (
                  <div className="space-y-1 max-h-64 overflow-y-auto border rounded-md p-3">
                    {comboModels.map((entry, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 rounded border px-3 py-2 text-sm bg-muted/30"
                      >
                        <Badge variant="outline" className="text-xs w-5 h-5 flex items-center justify-center p-0">
                          {entry.priority}
                        </Badge>
                        <span className="flex-1">
                          {entry.model}{" "}
                          <span className="text-muted-foreground text-xs">
                            ({getProviderName(entry.providerId)})
                          </span>
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => moveModel(index, "up")}
                          disabled={index === 0}
                          className="h-6 w-6 p-0"
                        >
                          ↑
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => moveModel(index, "down")}
                          disabled={index === comboModels.length - 1}
                          className="h-6 w-6 p-0"
                        >
                          ↓
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive h-6 w-6 p-0"
                          onClick={() => removeModelFromCombo(index)}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border rounded-md p-8 text-center text-sm text-muted-foreground">
                    No models added yet. Click "Add Models" to select models.
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  {editingCombo ? "Update" : "Create"}
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
                Choose models to add to your combo. Selected models will be added in the order you check them.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-hidden flex flex-col gap-4">
              {/* Selected count */}
              {tempSelectedModels.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  {tempSelectedModels.length} model{tempSelectedModels.length > 1 ? "s" : ""} selected
                </div>
              )}

              {/* Available Models with checkboxes */}
              <div className="flex-1 overflow-y-auto border rounded-md p-3 space-y-3">
                {providers.map((provider) => (
                  <div key={provider.id} className="space-y-1">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {provider.name}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {provider.models.map((model) => {
                        const isSelected = tempSelectedModels.some(
                          (m) => m.providerId === provider.id && m.model === model
                        );
                        return (
                          <label
                            key={`${provider.id}/${model}`}
                            className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleModelInTemp(provider.id, model)}
                              className="rounded"
                            />
                            <span className="text-sm flex-1 truncate" title={model}>
                              {model}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {providers.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No providers available. Add providers first.
                  </p>
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
                Save Selection
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Combo List */}
      {combos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              No combos created yet. Click &quot;Create Combo&quot; to set up fallback chains.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {combos.map((combo) => (
            <Card key={combo.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base font-medium">
                    {combo.name}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground font-mono mt-1">
                    {combo.slug}/&lt;model&gt;
                  </p>
                </div>
                <Switch
                  checked={combo.enabled}
                  onCheckedChange={(checked) => toggleCombo(combo.id, checked)}
                />
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Fallback Chain ({combo.models.length} models)
                  </p>
                  <div className="space-y-1">
                    {combo.models
                      .sort((a, b) => a.priority - b.priority)
                      .map((entry, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <Badge variant="outline" className="text-xs w-5 h-5 flex items-center justify-center p-0">
                            {entry.priority}
                          </Badge>
                          <span>{entry.model}</span>
                          <span className="text-muted-foreground text-xs">
                            ({getProviderName(entry.providerId)})
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEditDialog(combo)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteCombo(combo.id)}
                  >
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

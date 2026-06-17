"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, CheckCircle2, XCircle, MinusCircle, Wifi } from "lucide-react";
import { toast } from "sonner";

interface HealthResult {
  id: string;
  name: string;
  prefix: string;
  type: string;
  enabled: boolean;
  status: "ok" | "error" | "disabled";
  latencyMs: number | null;
  error: string | null;
}

function StatusIcon({ status }: { status: HealthResult["status"] }) {
  if (status === "ok") return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (status === "error") return <XCircle className="w-4 h-4 text-destructive" />;
  return <MinusCircle className="w-4 h-4 text-muted-foreground" />;
}

function LatencyBadge({ ms }: { ms: number | null }) {
  if (ms === null) return <span className="text-xs text-muted-foreground">—</span>;
  const color = ms < 500 ? "text-green-500" : ms < 1500 ? "text-yellow-500" : "text-destructive";
  return <span className={`text-xs font-mono font-medium ${color}`}>{ms}ms</span>;
}

export default function HealthCheckPage() {
  const [results, setResults] = useState<HealthResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  async function runCheck() {
    setLoading(true);
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        setResults(await res.json());
        setLastChecked(new Date());
      } else {
        toast.error("Failed to run health check");
      }
    } catch {
      toast.error("Connection error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runCheck();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ok = results.filter((r) => r.status === "ok").length;
  const error = results.filter((r) => r.status === "error").length;
  const disabled = results.filter((r) => r.status === "disabled").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Health Check</h2>
          <p className="text-muted-foreground mt-1">
            Test all provider connections at once
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastChecked && (
            <span className="text-xs text-muted-foreground">
              Last checked: {lastChecked.toLocaleTimeString()}
            </span>
          )}
          <Button onClick={runCheck} disabled={loading} size="sm">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Checking..." : "Check All"}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      {results.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-green-500 shrink-0" />
              <div>
                <p className="text-2xl font-bold">{ok}</p>
                <p className="text-xs text-muted-foreground">Online</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <XCircle className="w-8 h-8 text-destructive shrink-0" />
              <div>
                <p className="text-2xl font-bold">{error}</p>
                <p className="text-xs text-muted-foreground">Error</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <MinusCircle className="w-8 h-8 text-muted-foreground shrink-0" />
              <div>
                <p className="text-2xl font-bold">{disabled}</p>
                <p className="text-xs text-muted-foreground">Disabled</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Provider list */}
      {loading && results.length === 0 ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
          <Wifi className="w-5 h-5 animate-pulse" />
          <span>Checking providers...</span>
        </div>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-24 text-muted-foreground">
          <Wifi className="w-8 h-8 opacity-30" />
          <p className="text-sm">No providers found. Add a provider first.</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b">
                  <TableHead className="pl-4 text-xs font-semibold uppercase tracking-wide">Provider</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide">Prefix</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide">Type</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide">Status</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide">Latency</TableHead>
                  <TableHead className="pr-4 text-xs font-semibold uppercase tracking-wide">Info</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="pl-4 py-3 font-medium">{r.name}</TableCell>
                    <TableCell className="py-3">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{r.prefix}</code>
                    </TableCell>
                    <TableCell className="py-3">
                      <Badge variant="outline" className="text-xs">
                        {r.type === "apikey" ? "API Key" : "Custom"}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center gap-2">
                        <StatusIcon status={r.status} />
                        <span className={`text-sm capitalize ${
                          r.status === "ok" ? "text-green-500" :
                          r.status === "error" ? "text-destructive" :
                          "text-muted-foreground"
                        }`}>
                          {r.status}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <LatencyBadge ms={r.latencyMs} />
                    </TableCell>
                    <TableCell className="pr-4 py-3 text-xs text-muted-foreground">
                      {r.error ?? (r.status === "ok" ? "/models endpoint reachable" : r.status === "disabled" ? "Provider is disabled" : "")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

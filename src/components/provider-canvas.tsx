"use client";

import { useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

interface CanvasProvider {
  id: string;
  name: string;
  enabled: boolean;
  active: boolean;
}

interface ProviderCanvasProps {
  providers: CanvasProvider[];
  activeJobs?: number;
}

// Center node (WRouter) — single centered handle, edges use type="straight"
function WRouterNode({ data }: { data: { activeJobs: number } }) {
  const jobs = data.activeJobs ?? 0;
  return (
    <div
      className="relative flex items-center gap-2 px-5 py-3 rounded-xl border-2 border-primary bg-primary text-primary-foreground font-bold text-base shadow-lg"
      style={{ minWidth: 120 }}
    >
      {/* Single invisible handle at center — React Flow StraightEdge will draw from node center */}
      <Handle
        type="source"
        position={Position.Right}
        id="center"
        style={{ opacity: 0, top: "50%", left: "50%", transform: "translate(-50%,-50%)", right: "auto", bottom: "auto" }}
      />
      <span className="flex-1 text-center">WRouter</span>
      {jobs > 0 && (
        <span
          className="flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full text-[10px] font-bold bg-white/20 text-primary-foreground animate-pulse"
          title={`${jobs} active job${jobs !== 1 ? "s" : ""}`}
        >
          {jobs}
        </span>
      )}
    </div>
  );
}

// Provider node — single invisible centered handle
function ProviderNode({
  data,
}: {
  data: { label: string; enabled: boolean; active: boolean };
}) {
  return (
    <div
      className={`px-4 py-2.5 rounded-lg border text-sm font-medium shadow transition-all ${
        data.active
          ? "border-green-500 bg-green-500/10 text-green-600 dark:text-green-400 shadow-green-500/20 shadow-md"
          : data.enabled
          ? "border-border bg-card text-foreground"
          : "border-border bg-muted text-muted-foreground opacity-50"
      }`}
      style={{ minWidth: 110, textAlign: "center" }}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="center"
        style={{ opacity: 0, top: "50%", left: "50%", transform: "translate(-50%,-50%)", right: "auto", bottom: "auto" }}
      />
      <div className="flex items-center justify-center gap-1.5">
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${
            data.active
              ? "bg-green-500 animate-pulse"
              : data.enabled
              ? "bg-muted-foreground/40"
              : "bg-muted-foreground/20"
          }`}
        />
        {data.label}
      </div>
    </div>
  );
}

const nodeTypes = {
  wrouter: WRouterNode,
  provider: ProviderNode,
};

function buildGraph(
  providers: CanvasProvider[],
  activeJobs: number,
  dotColor: string,
  edgeColor: string,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  nodes.push({
    id: "wrouter",
    type: "wrouter",
    position: { x: 0, y: 0 },
    data: { activeJobs },
    draggable: false,
    selectable: false,
  });

  const count = providers.length;
  const radius = count <= 4 ? 200 : count <= 8 ? 250 : 300;

  providers.forEach((p, i) => {
    const angleDeg = -90 + (360 / count) * i;
    const angleRad = (angleDeg * Math.PI) / 180;
    const x = radius * Math.cos(angleRad);
    const y = radius * Math.sin(angleRad);

    nodes.push({
      id: p.id,
      type: "provider",
      position: { x, y },
      data: { label: p.name, enabled: p.enabled, active: p.active },
      draggable: false,
      selectable: false,
    });

    edges.push({
      id: `e-wrouter-${p.id}`,
      source: "wrouter",
      sourceHandle: "center",
      target: p.id,
      targetHandle: "center",
      type: "straight",
      animated: p.active,
      style: {
        stroke: p.active ? "#22c55e" : edgeColor,
        strokeWidth: p.active ? 2 : 1,
        strokeDasharray: p.active ? undefined : "5 5",
        opacity: p.active ? 1 : 0.3,
      },
    });
  });

  return { nodes, edges };
}

// Read a computed CSS custom property from the document root as an rgb/hex value
function resolveColor(cssVar: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(cssVar)
    .trim();
  if (!raw) return fallback;
  // Tailwind v4 returns space-separated channels like "220 13% 91%"
  // Wrap into hsl() for SVG
  return raw.includes("%") ? `hsl(${raw})` : raw;
}

export function ProviderCanvas({
  providers,
  activeJobs = 0,
}: ProviderCanvasProps) {
  const [dotColor, setDotColor] = useState("#555");
  const [edgeColor, setEdgeColor] = useState("#555");
  const containerRef = useRef<HTMLDivElement>(null);

  // Resolve theme colors and watch for dark/light mode changes
  useEffect(() => {
    function updateColors() {
      const dot = resolveColor("--border", "#555");
      const edge = resolveColor("--border", "#555");
      setDotColor(dot);
      setEdgeColor(edge);
    }

    updateColors();

    // Watch for theme changes on <html> class attribute
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === "class") {
          updateColors();
          break;
        }
      }
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  const [nodes, setNodes] = useState<Node[]>(
    () => buildGraph(providers, activeJobs, dotColor, edgeColor).nodes
  );
  const [edges, setEdges] = useState<Edge[]>(
    () => buildGraph(providers, activeJobs, dotColor, edgeColor).edges
  );

  useEffect(() => {
    const { nodes: n, edges: e } = buildGraph(providers, activeJobs, dotColor, edgeColor);
    setNodes(n);
    setEdges(e);
  }, [providers, activeJobs, dotColor, edgeColor]);

  if (providers.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No providers configured yet.
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.35 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
        style={{ background: "transparent" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={2}
          color="#3a3a3a"
        />
      </ReactFlow>
    </div>
  );
}

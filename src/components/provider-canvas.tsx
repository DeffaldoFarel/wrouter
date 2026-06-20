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
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Zap, Server, Activity, Lock, Unlock, Maximize2 } from "lucide-react";
import { getProviderIcon } from "@/components/provider-icons";

interface CanvasProvider {
  id: string;
  name: string;
  enabled: boolean;
  active: boolean;
  prefix?: string;
}

interface ProviderCanvasProps {
  providers: CanvasProvider[];
  activeJobs?: number;
}

// ─────────────────────────────────────────────
//  WRouter Center Node
// ─────────────────────────────────────────────

function WRouterNode({ data }: { data: { activeJobs: number } }) {
  const jobs = data.activeJobs ?? 0;
  const hasActive = jobs > 0;

  return (
    <div className="relative">
      {/* Outer glow ring when active */}
      {hasActive && (
        <div className="absolute inset-0 -m-3 rounded-2xl bg-primary/25 blur-xl animate-pulse" />
      )}

      {/* Main node */}
      <div
        className="relative flex items-center gap-3 px-6 py-4 rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground font-bold shadow-2xl ring-2 ring-primary/40 ring-offset-2 ring-offset-background"
        style={{ minWidth: 200 }}
      >
        {/* Two source handles for left/right side providers */}
        <Handle
          type="source"
          position={Position.Right}
          id="right"
          style={{
            opacity: 0,
            top: "50%",
            right: 0,
            transform: "translate(50%,-50%)",
          }}
        />
        <Handle
          type="source"
          position={Position.Left}
          id="left"
          style={{
            opacity: 0,
            top: "50%",
            left: 0,
            transform: "translate(-50%,-50%)",
          }}
        />

        <div className="flex items-center justify-center h-11 w-11 rounded-xl bg-white/20 shrink-0">
          <Zap className="h-6 w-6" />
        </div>

        <div className="flex-1 text-left">
          <div className="text-base font-bold leading-tight">WRouter</div>
          {hasActive ? (
            <div className="text-xs opacity-90 flex items-center gap-1 mt-0.5">
              <Activity className="h-3 w-3 animate-pulse" />
              {jobs} active job{jobs !== 1 ? "s" : ""}
            </div>
          ) : (
            <div className="text-xs opacity-70 mt-0.5">Idle</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  Provider Node
// ─────────────────────────────────────────────

function ProviderNode({
  data,
}: {
  data: { label: string; enabled: boolean; active: boolean; prefix?: string; side: "left" | "right" };
}) {
  const Icon = data.prefix ? getProviderIcon(data.prefix) : null;

  const stateClass = data.active
    ? "border-green-500 bg-card shadow-green-500/30 shadow-xl"
    : data.enabled
    ? "border-border bg-card hover:border-primary/40 shadow-md"
    : "border-border bg-muted/40 opacity-60";

  const textClass = data.active
    ? "text-green-700 dark:text-green-300"
    : data.enabled
    ? "text-foreground"
    : "text-muted-foreground";

  return (
    <div className="relative">
      {/* Glow ring when active */}
      {data.active && (
        <div className="absolute inset-0 -m-2 rounded-2xl bg-green-500/25 blur-xl animate-pulse" />
      )}

      <div
        className={`relative px-5 py-4 rounded-2xl border-2 transition-all ${stateClass}`}
        style={{ minWidth: 220 }}
      >
        {/* Handle on the inward side (toward WRouter center) */}
        <Handle
          type="target"
          position={data.side === "right" ? Position.Left : Position.Right}
          id={data.side === "right" ? "left" : "right"}
          style={{
            opacity: 0,
            top: "50%",
            [data.side === "right" ? "left" : "right"]: 0,
            transform: data.side === "right" ? "translate(-50%,-50%)" : "translate(50%,-50%)",
          }}
        />

        <div className="flex items-center gap-3">
          {/* Brand icon or fallback */}
          {Icon ? (
            <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-muted/50 border shrink-0">
              <Icon size={28} />
            </div>
          ) : (
            <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-muted shrink-0">
              <Server className="h-6 w-6 text-muted-foreground" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className={`text-sm font-semibold leading-tight truncate ${textClass}`}>
              {data.label}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  data.active
                    ? "bg-green-500 animate-pulse"
                    : data.enabled
                    ? "bg-muted-foreground/40"
                    : "bg-muted-foreground/20"
                }`}
              />
              <span className="text-xs text-muted-foreground">
                {data.active ? "Active" : data.enabled ? "Online" : "Offline"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const nodeTypes = {
  wrouter: WRouterNode,
  provider: ProviderNode,
};

// ─────────────────────────────────────────────
//  Graph Builder
// ─────────────────────────────────────────────

function buildGraph(
  providers: CanvasProvider[],
  activeJobs: number,
  edgeColor: string,
  activeEdgeColor: string
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // WRouter at center
  nodes.push({
    id: "wrouter",
    type: "wrouter",
    position: { x: 0, y: 0 },
    data: { activeJobs },
    draggable: false,
    selectable: false,
  });

  const count = providers.length;
  if (count === 0) return { nodes, edges };

  // Split providers into left & right columns (alternating for visual balance)
  // Even index → right side, odd index → left side
  const rightColumn: { provider: CanvasProvider; index: number }[] = [];
  const leftColumn: { provider: CanvasProvider; index: number }[] = [];
  providers.forEach((p, i) => {
    if (i % 2 === 0) rightColumn.push({ provider: p, index: i });
    else leftColumn.push({ provider: p, index: i });
  });

  // Layout constants
  const HORIZONTAL_DISTANCE = 420; // distance from WRouter to provider column
  const VERTICAL_SPACING = 130;    // vertical gap between providers in same column
  const STAGGER_OFFSET = 40;       // horizontal stagger to make bezier curves visible

  // Place right column
  rightColumn.forEach(({ provider, index }, i) => {
    const total = rightColumn.length;
    // Center the column vertically around y=0
    const y = (i - (total - 1) / 2) * VERTICAL_SPACING;
    // Stagger: alternate between near and far X positions
    const stagger = i % 2 === 0 ? 0 : STAGGER_OFFSET;
    const x = HORIZONTAL_DISTANCE + stagger;

    nodes.push({
      id: provider.id,
      type: "provider",
      position: { x, y },
      data: {
        label: provider.name,
        enabled: provider.enabled,
        active: provider.active,
        prefix: provider.prefix,
        side: "right",
      },
      draggable: false,
      selectable: false,
    });

    edges.push({
      id: `e-wrouter-${provider.id}`,
      source: "wrouter",
      sourceHandle: "right",
      target: provider.id,
      targetHandle: "left",
      type: "default",
      animated: false,
      className: provider.active ? "wrouter-edge-active" : "wrouter-edge-idle",
      style: {
        stroke: provider.active ? activeEdgeColor : edgeColor,
        strokeWidth: provider.active ? 3.5 : 2.5,
        strokeDasharray: provider.active ? "12 8" : provider.enabled ? "8 6" : "5 5",
        strokeLinecap: "butt",
        opacity: provider.active ? 1 : provider.enabled ? 0.85 : 0.5,
      },
    });
    // Suppress unused-var warning for `index`
    void index;
  });

  // Place left column
  leftColumn.forEach(({ provider, index }, i) => {
    const total = leftColumn.length;
    const y = (i - (total - 1) / 2) * VERTICAL_SPACING;
    const stagger = i % 2 === 0 ? 0 : STAGGER_OFFSET;
    const x = -HORIZONTAL_DISTANCE - stagger;

    nodes.push({
      id: provider.id,
      type: "provider",
      position: { x, y },
      data: {
        label: provider.name,
        enabled: provider.enabled,
        active: provider.active,
        prefix: provider.prefix,
        side: "left",
      },
      draggable: false,
      selectable: false,
    });

    edges.push({
      id: `e-wrouter-${provider.id}`,
      source: "wrouter",
      sourceHandle: "left",
      target: provider.id,
      targetHandle: "right",
      type: "default",
      animated: false,
      className: provider.active ? "wrouter-edge-active" : "wrouter-edge-idle",
      style: {
        stroke: provider.active ? activeEdgeColor : edgeColor,
        strokeWidth: provider.active ? 3.5 : 2.5,
        strokeDasharray: provider.active ? "12 8" : provider.enabled ? "8 6" : "5 5",
        strokeLinecap: "butt",
        opacity: provider.active ? 1 : provider.enabled ? 0.85 : 0.5,
      },
    });
    void index;
  });

  return { nodes, edges };
}

// Read computed CSS variable
function resolveColor(cssVar: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(cssVar)
    .trim();
  if (!raw) return fallback;
  return raw.includes("%") ? `hsl(${raw})` : raw;
}

// ─────────────────────────────────────────────
//  Main Canvas
// ─────────────────────────────────────────────

// Custom zoom controls rendered inside ReactFlow (has access to useReactFlow)
// Store fitView callback via a ref so the parent can call it
let fitViewCallback: (() => void) | null = null;
let zoomInCallback: (() => void) | null = null;
let zoomOutCallback: (() => void) | null = null;

// Internal component that registers fitView with the outer ref
function ReactFlowControls() {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  useEffect(() => {
    fitViewCallback = () => fitView({ padding: 0.35, duration: 200 });
    zoomInCallback = () => zoomIn();
    zoomOutCallback = () => zoomOut();
    return () => {
      fitViewCallback = null;
      zoomInCallback = null;
      zoomOutCallback = null;
    };
  }, [fitView, zoomIn, zoomOut]);
  return null;
}

export function ProviderCanvas({ providers, activeJobs = 0 }: ProviderCanvasProps) {
  const [edgeColor, setEdgeColor] = useState("#64748b");
  const [activeEdgeColor, setActiveEdgeColor] = useState("#10b981");
  const [bgDotColor, setBgDotColor] = useState("#3a3a3a");
  const [isDark, setIsDark] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useRef<ReturnType<typeof useReactFlow> | null>(null);

  useEffect(() => {
    function updateColors() {
      const dark = document.documentElement.classList.contains("dark");
      setIsDark(dark);

      // Resolve foreground color for edges
      const probe = document.createElement("span");
      probe.style.cssText = "position:absolute;pointer-events:none;opacity:0;";
      probe.className = "text-muted-foreground";
      document.body.appendChild(probe);
      const fg = getComputedStyle(probe).color;
      document.body.removeChild(probe);

      // Edge color: muted-foreground at lower opacity in dark, slate-400 in light
      setEdgeColor(fg || (dark ? "#64748b" : "#94a3b8"));

      // Active edge color: bright green-500 matching legend dot in BOTH themes
      setActiveEdgeColor("#22c55e");

      // Background dot color
      const dot = resolveColor("--border", dark ? "#3a3a3a" : "#e5e7eb");
      setBgDotColor(dot);
    }

    updateColors();

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
    () => buildGraph(providers, activeJobs, edgeColor, activeEdgeColor).nodes
  );
  const [edges, setEdges] = useState<Edge[]>(
    () => buildGraph(providers, activeJobs, edgeColor, activeEdgeColor).edges
  );

  useEffect(() => {
    const { nodes: n, edges: e } = buildGraph(
      providers,
      activeJobs,
      edgeColor,
      activeEdgeColor
    );
    setNodes(n);
    setEdges(e);
  }, [providers, activeJobs, edgeColor, activeEdgeColor]);

  if (providers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-3 p-6">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <Server className="h-5 w-5 opacity-50" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-medium">No providers configured</p>
          <p className="text-xs">
            Add a provider to see the connection map
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full"
      style={{
        width: "100%",
        height: "100%",
        // Subtle radial gradient background for depth
        background: isDark
          ? "radial-gradient(circle at center, rgba(99,102,241,0.03), transparent 70%)"
          : "radial-gradient(circle at center, rgba(99,102,241,0.04), transparent 70%)",
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.35 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={!isLocked}
        zoomOnScroll={!isLocked}
        zoomOnPinch={!isLocked}
        zoomOnDoubleClick={!isLocked}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
        style={{ background: "transparent" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.5}
          color={bgDotColor}
          style={{ opacity: 0.5 }}
        />
        <ReactFlowControls />
      </ReactFlow>

      {/* Controls toolbar - outside ReactFlow so buttons are clickable */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-0 bg-background/90 backdrop-blur-sm border rounded-md overflow-hidden shadow-sm z-10">
        {/* Zoom In */}
        <button
          title="Zoom in"
          className="flex items-center justify-center h-8 w-8 hover:bg-accent transition-colors"
          onClick={() => zoomInCallback?.()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>
        <div className="h-px bg-border" />
        {/* Zoom Out */}
        <button
          title="Zoom out"
          className="flex items-center justify-center h-8 w-8 hover:bg-accent transition-colors"
          onClick={() => zoomOutCallback?.()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>
        <div className="h-px bg-border" />
        {/* Fit View */}
        <button
          title="Fit view"
          className="flex items-center justify-center h-8 w-8 hover:bg-accent transition-colors"
          onClick={() => fitViewCallback?.()}
        >
          <Maximize2 size={16} className="text-muted-foreground" />
        </button>
        <div className="h-px bg-border" />
        {/* Lock/Unlock */}
        <button
          title={isLocked ? "Unlock pan & zoom" : "Lock view"}
          className="flex items-center justify-center h-8 w-8 hover:bg-accent transition-colors"
          onClick={() => setIsLocked((l) => !l)}
        >
          {isLocked ? (
            <Lock size={16} className="text-muted-foreground" />
          ) : (
            <Unlock size={16} className="text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Legend overlay */}
      <div className="absolute bottom-3 right-3 flex items-center gap-3 px-3 py-1.5 rounded-md bg-background/80 backdrop-blur-sm border text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Active
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/40" />
          Online
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/20" />
          Offline
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef } from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@kody-ade/base/ui/button";
import {
  DataSet,
  Network,
  type Edge,
  type Node,
  type Options,
} from "vis-network/standalone";
import type {
  KnowledgeArea,
  KnowledgeMap,
} from "../model/knowledge-graph-projections";

const AREA_COLORS: Record<KnowledgeArea, string> = {
  company: "#f59e0b",
  business: "#38bdf8",
  data: "#22c55e",
  technology: "#06b6d4",
  work: "#fb7185",
  agency: "#a78bfa",
};

const NODE_FONT = {
  color: "#e2e8f0",
  face: "Inter, ui-sans-serif, system-ui",
  size: 14,
  strokeColor: "#020617",
  strokeWidth: 5,
};

const DOMAIN_POSITIONS: Record<KnowledgeArea, { x: number; y: number }> = {
  company: { x: -190, y: -110 },
  business: { x: 0, y: -165 },
  data: { x: 190, y: -110 },
  technology: { x: 190, y: 110 },
  work: { x: 0, y: 165 },
  agency: { x: -190, y: 110 },
};

function toNode(
  node: KnowledgeMap["nodes"][number],
  showLabel: boolean,
): Node {
  const color = AREA_COLORS[node.area];
  const isDomain = node.type === "knowledge_domain";
  const position = isDomain ? DOMAIN_POSITIONS[node.area] : undefined;
  return {
    id: node.id,
    label: showLabel ? node.displayLabel : "",
    shape: "dot",
    size: isDomain ? 30 : Math.min(18, 7 + Math.sqrt(node.count) * 2.5),
    x: position?.x,
    y: position?.y,
    physics: !isDomain,
    color: {
      background: color,
      border: "#e2e8f0",
      highlight: { background: color, border: "#ffffff" },
      hover: { background: color, border: "#ffffff" },
    },
    borderWidth: isDomain ? 2 : 0.5,
    borderWidthSelected: 2,
    font: isDomain ? { ...NODE_FONT, size: 16 } : NODE_FONT,
    title: `${node.label} · ${node.type.replaceAll("_", " ").replaceAll("-", " ")}`,
  };
}

function toEdge(edge: KnowledgeMap["edges"][number]): Edge {
  return {
    id: edge.id,
    from: edge.source,
    to: edge.target,
    arrows: { to: { enabled: true, scaleFactor: 0.25 } },
    color: {
      color: "rgba(148, 163, 184, 0.14)",
      highlight: "rgba(226, 232, 240, 0.72)",
      hover: "rgba(203, 213, 225, 0.42)",
      inherit: false,
    },
    smooth: { enabled: true, type: "continuous", roundness: 0.2 },
    width: 0.7,
  };
}

const NETWORK_OPTIONS: Options = {
  autoResize: true,
  nodes: {
    chosen: true,
    shadow: {
      enabled: true,
      color: "rgba(56, 189, 248, 0.2)",
      size: 8,
      x: 0,
      y: 0,
    },
  },
  edges: {
    selectionWidth: 2,
    hoverWidth: 1.5,
  },
  interaction: {
    hover: true,
    hoverConnectedEdges: true,
    keyboard: true,
    multiselect: false,
    navigationButtons: false,
    tooltipDelay: 180,
    zoomSpeed: 0.7,
  },
  physics: {
    enabled: true,
    solver: "forceAtlas2Based",
    forceAtlas2Based: {
      gravitationalConstant: -54,
      centralGravity: 0.012,
      springLength: 105,
      springConstant: 0.075,
      damping: 0.42,
      avoidOverlap: 0.75,
    },
    maxVelocity: 30,
    minVelocity: 0.35,
    stabilization: { enabled: true, iterations: 300, fit: true },
    timestep: 0.45,
  },
};

export function KnowledgeGraphCanvas({
  map,
  selectedId,
  onNodeSelect,
}: {
  map: KnowledgeMap;
  selectedId?: string | null;
  onNodeSelect?: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesRef = useRef<DataSet<Node> | null>(null);
  const mapRef = useRef(map);
  const labelsVisibleRef = useRef(false);
  const selectedIdRef = useRef(selectedId);
  mapRef.current = map;
  selectedIdRef.current = selectedId;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const showLabels = map.nodes.length <= 30;
    const isDomainOverview = map.nodes.every(
      (node) => node.type === "knowledge_domain",
    );
    const nodes = new DataSet<Node>(
      map.nodes.map((node) => toNode(node, showLabels)),
    );
    const edges = new DataSet<Edge>(map.edges.map(toEdge));
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const options: Options = isDomainOverview
      ? { ...NETWORK_OPTIONS, physics: { enabled: false } }
      : reduceMotion
      ? {
          ...NETWORK_OPTIONS,
          physics: {
            ...NETWORK_OPTIONS.physics,
            stabilization: { enabled: true, iterations: 250, fit: true },
          },
        }
      : NETWORK_OPTIONS;
    const network = new Network(container, { nodes, edges }, options);
    networkRef.current = network;
    nodesRef.current = nodes;
    labelsVisibleRef.current = showLabels;

    const fitFrame = requestAnimationFrame(() =>
      requestAnimationFrame(() => network.fit({ animation: false })),
    );

    const updateLabels = (visible: boolean, hoverId?: string) => {
      labelsVisibleRef.current = visible;
      nodes.update(
        mapRef.current.nodes.map((node) => ({
          id: node.id,
          label:
            showLabels ||
            visible ||
            node.id === hoverId ||
            node.id === selectedIdRef.current
              ? node.displayLabel
              : "",
        })),
      );
    };

    network.once("stabilized", () => {
      network.fit({
        animation: reduceMotion
          ? false
          : { duration: 350, easingFunction: "easeInOutQuad" },
      });
    });
    network.on("zoom", () => {
      if (labelsVisibleRef.current) updateLabels(false);
    });
    network.on("hoverNode", ({ node }) => {
      if (!labelsVisibleRef.current) updateLabels(false, String(node));
    });
    network.on("blurNode", () => {
      if (!labelsVisibleRef.current) updateLabels(false);
    });
    network.on("selectNode", ({ nodes: selectedNodes }) => {
      const id = selectedNodes[0];
      if (id !== undefined) onNodeSelect?.(String(id));
    });

    const observer = new ResizeObserver(() => {
      network.redraw();
      if (isDomainOverview) network.fit({ animation: false });
    });
    observer.observe(container);

    return () => {
      cancelAnimationFrame(fitFrame);
      observer.disconnect();
      network.destroy();
      networkRef.current = null;
      nodesRef.current = null;
    };
  }, [map, onNodeSelect]);

  useEffect(() => {
    const network = networkRef.current;
    const nodes = nodesRef.current;
    if (!network || !nodes) return;

    nodes.update(
      map.nodes.map((node) => ({
        id: node.id,
        label:
          labelsVisibleRef.current || node.id === selectedId
            ? node.displayLabel
            : "",
      })),
    );
    if (!selectedId) {
      network.unselectAll();
      return;
    }

    network.selectNodes([selectedId]);
    network.once("stabilized", () => {
      network.focus(selectedId, {
        scale: Math.max(network.getScale(), 1.15),
        animation: { duration: 300, easingFunction: "easeInOutQuad" },
      });
    });
  }, [map, selectedId]);

  const zoom = useCallback((factor: number) => {
    const network = networkRef.current;
    if (!network) return;
    network.moveTo({
      scale: Math.min(2.5, Math.max(0.35, network.getScale() * factor)),
      animation: { duration: 180, easingFunction: "easeInOutQuad" },
    });
  }, []);
  const fit = useCallback(() => {
    networkRef.current?.fit({
      animation: { duration: 220, easingFunction: "easeInOutQuad" },
    });
  }, []);

  return (
    <div className="relative h-full min-h-[440px] w-full">
      <div
        ref={containerRef}
        data-testid="knowledge-graph-canvas"
        aria-label="Interactive knowledge graph"
        className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(14,116,144,0.14),rgba(2,6,23,0.98)_68%)]"
      />
      <div className="absolute bottom-3 right-3 z-10 flex gap-1 rounded-md border border-white/10 bg-slate-950/85 p-1 backdrop-blur">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 px-0"
          aria-label="Zoom in"
          onClick={() => zoom(1.25)}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 px-0"
          aria-label="Zoom out"
          onClick={() => zoom(0.8)}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 px-0"
          aria-label="Fit graph"
          onClick={fit}
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

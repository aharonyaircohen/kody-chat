"use client";

import { useEffect, useRef } from "react";
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
  purpose: "#f59e0b",
  product: "#38bdf8",
  work: "#fb7185",
  agency: "#a78bfa",
  evidence: "#34d399",
};

const NODE_FONT = {
  color: "#e2e8f0",
  face: "Inter, ui-sans-serif, system-ui",
  size: 14,
  strokeColor: "#020617",
  strokeWidth: 5,
};

function toNode(node: KnowledgeMap["nodes"][number]): Node {
  const color = AREA_COLORS[node.area];
  return {
    id: node.id,
    label: "",
    shape: "dot",
    size: Math.min(18, 7 + Math.sqrt(node.count) * 2.5),
    color: {
      background: color,
      border: "#e2e8f0",
      highlight: { background: color, border: "#ffffff" },
      hover: { background: color, border: "#ffffff" },
    },
    borderWidth: 0.5,
    borderWidthSelected: 2,
    font: NODE_FONT,
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
    stabilization: false,
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

    const nodes = new DataSet<Node>(map.nodes.map(toNode));
    const edges = new DataSet<Edge>(map.edges.map(toEdge));
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const options: Options = reduceMotion
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

    const updateLabels = (visible: boolean, hoverId?: string) => {
      labelsVisibleRef.current = visible;
      nodes.update(
        mapRef.current.nodes.map((node) => ({
          id: node.id,
          label:
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
    network.on("zoom", ({ scale }) => {
      const visible = scale >= 1.15;
      if (visible !== labelsVisibleRef.current) updateLabels(visible);
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

    const observer = new ResizeObserver(() => network.redraw());
    observer.observe(container);

    return () => {
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
    network.focus(selectedId, {
      scale: Math.max(network.getScale(), 1.15),
      animation: { duration: 300, easingFunction: "easeInOutQuad" },
    });
  }, [map, selectedId]);

  return (
    <div
      ref={containerRef}
      data-testid="knowledge-graph-canvas"
      aria-label="Interactive knowledge graph"
      className="h-full min-h-[500px] w-full bg-slate-950"
    />
  );
}

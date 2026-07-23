"use client";

import cytoscape, {
  type Core,
  type ElementDefinition,
  type EventObject,
  type LayoutOptions,
  type SingularElementReturnValue,
  type StylesheetJson,
} from "cytoscape";
import fcose from "cytoscape-fcose";
import { useEffect, useRef } from "react";
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

cytoscape.use(fcose);

function toElements(map: KnowledgeMap): ElementDefinition[] {
  return [
    ...map.nodes.map((node) => ({
      data: {
        id: node.id,
        label: node.label,
        displayLabel: node.displayLabel,
        count: node.count,
        area: node.area,
        kind: node.kind,
        color: AREA_COLORS[node.area],
        size:
          node.kind === "entity"
            ? Math.min(58, 27 + Math.sqrt(node.count) * 8)
            : undefined,
      },
    })),
    ...map.edges.map((edge) => ({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        kind: edge.kind,
      },
    })),
  ];
}

const GRAPH_STYLES: StylesheetJson = [
  {
    selector: 'node[kind = "entity"]',
    style: {
      "background-color": "data(color)",
      "border-color": "#f8fafc",
      "border-opacity": 0.2,
      "border-width": 1,
      color: "#e2e8f0",
      "font-size": 11,
      height: "data(size)",
      label: "",
      "min-zoomed-font-size": 0,
      shape: "ellipse",
      "text-background-color": "#020617",
      "text-background-opacity": 0.82,
      "text-background-padding": "3px",
      "text-halign": "center",
      "text-margin-y": 8,
      "text-max-width": "150px",
      "text-valign": "bottom",
      "text-wrap": "wrap",
      width: "data(size)",
    },
  },
  {
    selector: 'node[kind = "entity"].labels-visible',
    style: {
      label: "data(displayLabel)",
    },
  },
  {
    selector: 'node[kind = "area"]',
    style: {
      "background-color": "data(color)",
      "background-opacity": 0.18,
      "border-color": "data(color)",
      "border-opacity": 0.9,
      "border-width": 2,
      color: "#f8fafc",
      content: "data(label)",
      "font-size": 14,
      "font-weight": 600,
      height: 78,
      "min-zoomed-font-size": 0,
      shape: "ellipse",
      "text-halign": "center",
      "text-valign": "center",
      width: 78,
    },
  },
  {
    selector: 'node[kind = "entity"].hovered, node[kind = "entity"]:selected',
    style: {
      "border-color": "#f8fafc",
      "border-opacity": 1,
      "border-width": 3,
      label: "data(displayLabel)",
      "min-zoomed-font-size": 0,
      "z-index": 20,
    },
  },
  {
    selector: "node.dimmed",
    style: {
      label: "",
      opacity: 0.18,
    },
  },
  {
    selector: 'edge[kind = "relation"]',
    style: {
      "curve-style": "bezier",
      "line-color": "#94a3b8",
      "line-opacity": 0.18,
      "target-arrow-color": "#94a3b8",
      "target-arrow-shape": "triangle",
      "target-arrow-fill": "filled",
      width: 1,
    },
  },
  {
    selector: 'edge[kind = "membership"]',
    style: {
      "curve-style": "bezier",
      "line-color": "#64748b",
      "line-opacity": 0.12,
      "line-style": "dashed",
      width: 1,
    },
  },
  {
    selector: "edge.dimmed",
    style: {
      opacity: 0.08,
    },
  },
  {
    selector: "edge.related",
    style: {
      color: "#cbd5e1",
      content: "data(label)",
      "font-size": 9,
      "line-color": "#cbd5e1",
      "line-opacity": 0.72,
      "min-zoomed-font-size": 0,
      "target-arrow-color": "#cbd5e1",
      "text-background-color": "#020617",
      "text-background-opacity": 0.9,
      "text-background-padding": "2px",
      "text-rotation": "autorotate",
      width: 2,
      "z-index": 10,
    },
  },
];

function revealNode(
  graph: Core,
  node: SingularElementReturnValue,
  fit: boolean,
) {
  graph.elements().removeClass("related dimmed").unselect();
  graph.nodes('[kind = "entity"]').addClass("dimmed");
  graph.edges().addClass("dimmed");

  node.select().removeClass("dimmed");
  node.neighborhood("node").removeClass("dimmed");
  node
    .connectedEdges('[kind = "relation"]')
    .removeClass("dimmed")
    .addClass("related");
  node.connectedEdges('[kind = "membership"]').removeClass("dimmed");

  if (fit) {
    graph.animate({
      fit: { eles: node.closedNeighborhood(), padding: 110 },
      duration: 260,
    });
  }
}

function clearFocus(graph: Core) {
  graph.elements().removeClass("related dimmed").unselect();
}

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
  const graphRef = useRef<Core | null>(null);
  const layoutReadyRef = useRef(false);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const shouldAnimate = !window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches;
    const graph = cytoscape({
      container,
      elements: toElements(map),
      style: GRAPH_STYLES,
      layout: { name: "preset" },
      minZoom: 0.18,
      maxZoom: 4,
    });
    graphRef.current = graph;
    layoutReadyRef.current = false;
    let labelZoomThreshold = Number.POSITIVE_INFINITY;
    const updateLabelVisibility = () => {
      graph
        .nodes('[kind = "entity"]')
        .toggleClass("labels-visible", graph.zoom() >= labelZoomThreshold);
    };
    const completeLayout = () => {
      layoutReadyRef.current = true;
      graph.resize();
      graph.fit(undefined, 64);
      labelZoomThreshold = graph.zoom() * 1.45;
      updateLabelVisibility();

      const currentSelectedId = selectedIdRef.current;
      if (!currentSelectedId) return;
      const selectedNode = graph.getElementById(currentSelectedId);
      if (selectedNode.nonempty()) revealNode(graph, selectedNode, true);
    };
    graph.one("layoutstop", completeLayout);
    const layoutOptions = {
      name: "fcose",
      quality: "draft",
      randomize: true,
      animate: shouldAnimate,
      animationDuration: 900,
      numIter: map.nodes.length > 2_000 ? 40 : 100,
      nodeSeparation: 60,
      fit: true,
      padding: 64,
    } as LayoutOptions;
    const layout = graph.layout(layoutOptions);

    const selectNode = (event: EventObject) => {
      if (event.target.data("kind") !== "entity") return;
      revealNode(graph, event.target, false);
      onNodeSelect?.(event.target.id());
    };
    const clearSelection = (event: EventObject) => {
      if (event.target === graph) clearFocus(graph);
    };
    const showNodeLabel = (event: EventObject) => {
      event.target.addClass("hovered");
    };
    const hideNodeLabel = (event: EventObject) => {
      event.target.removeClass("hovered");
    };
    graph.on("tap", "node", selectNode);
    graph.on("tap", clearSelection);
    graph.on("zoom", updateLabelVisibility);
    graph.on("mouseover", 'node[kind = "entity"]', showNodeLabel);
    graph.on("mouseout", 'node[kind = "entity"]', hideNodeLabel);

    const observer = new ResizeObserver(() => {
      graph.resize();
    });
    observer.observe(container);
    layout.run();

    return () => {
      observer.disconnect();
      graph.off("layoutstop", completeLayout);
      layout.stop();
      graph.off("tap", "node", selectNode);
      graph.off("tap", clearSelection);
      graph.off("zoom", updateLabelVisibility);
      graph.off("mouseover", 'node[kind = "entity"]', showNodeLabel);
      graph.off("mouseout", 'node[kind = "entity"]', hideNodeLabel);
      graph.destroy();
      graphRef.current = null;
    };
  }, [map, onNodeSelect]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || !layoutReadyRef.current) return;
    if (!selectedId) {
      clearFocus(graph);
      return;
    }
    const node = graph.getElementById(selectedId);
    if (node.nonempty()) revealNode(graph, node, true);
  }, [map, selectedId]);

  return (
    <div
      ref={containerRef}
      data-testid="knowledge-graph-canvas"
      className="h-full min-h-[500px] w-full"
    />
  );
}

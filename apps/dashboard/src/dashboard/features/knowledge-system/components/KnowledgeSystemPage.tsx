"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import cytoscape, { type Core, type LayoutOptions } from "cytoscape";
import fcose from "cytoscape-fcose";
import { RefreshCw, Search } from "lucide-react";
import { Button } from "@kody-ade/base/ui/button";
import { Input } from "@kody-ade/base/ui/input";
import { buildAuthHeaders, useAuth } from "@dashboard/lib/auth-context";
import {
  filterKnowledgeGraph,
  parseGraphifyGraph,
  type KnowledgeGraph,
  type KnowledgeGraphNode,
} from "@dashboard/lib/knowledge-system/graph";
import { toCytoscapeElements } from "@dashboard/lib/knowledge-system/graph-view";

type Bundle = {
  graphUrl: string;
  generatedAt: string;
  nodeCount: number;
  edgeCount: number;
  sourceRevision?: string;
};

const DOMAIN_COLORS: Record<string, string> = {
  business: "#f59e0b",
  project: "#22c55e",
  code: "#38bdf8",
  agency: "#a78bfa",
  work: "#fb7185",
  quality: "#2dd4bf",
  data: "#818cf8",
  knowledge: "#e879f9",
  other: "#94a3b8",
};

cytoscape.use(fcose);

function mountGraph(
  container: HTMLDivElement,
  graph: KnowledgeGraph,
  onSelect: (nodeId: string) => void,
): Core {
  const cy = cytoscape({
    container,
    elements: toCytoscapeElements(graph),
    layout: {
      name: "fcose",
      quality: "draft",
      randomize: true,
      animate: graph.nodes.length <= 5_000,
      animationDuration: 900,
      numIter: graph.nodes.length > 2_000 ? 40 : 100,
      nodeSeparation: 60,
      fit: true,
    } as LayoutOptions,
    minZoom: 0.02,
    maxZoom: 8,
    wheelSensitivity: 0.15,
    autoungrabify: false,
    boxSelectionEnabled: false,
    textureOnViewport: true,
    hideEdgesOnViewport: true,
    style: [
      {
        selector: "node",
        style: {
          width: (element: { degree: () => number }) =>
            Math.min(18, 5 + Math.sqrt(element.degree()) * 1.6),
          height: (element: { degree: () => number }) =>
            Math.min(18, 5 + Math.sqrt(element.degree()) * 1.6),
          "background-color": (element: { data: (key: string) => string }) =>
            DOMAIN_COLORS[element.data("domain")] ?? DOMAIN_COLORS.other,
          label: "",
          "overlay-opacity": 0,
          "transition-property": "opacity, width, height",
          "transition-duration": 180,
        },
      },
      {
        selector: "node:selected",
        style: {
          width: 18,
          height: 18,
          label: "data(label)",
          "font-size": 12,
          color: "#e5e7eb",
          "text-background-color": "#020617",
          "text-background-opacity": 0.9,
          "text-background-padding": "4px",
          "text-wrap": "ellipsis",
          "text-max-width": "220px",
          "z-index": 10,
        },
      },
      {
        selector: ".faded",
        style: {
          opacity: 0.08,
        },
      },
      {
        selector: "node.hovered",
        style: {
          width: 18,
          height: 18,
          label: "data(label)",
          "font-size": 12,
          color: "#e5e7eb",
          "text-background-color": "#020617",
          "text-background-opacity": 0.9,
          "text-background-padding": "4px",
          "text-wrap": "ellipsis",
          "text-max-width": "220px",
          "z-index": 10,
        },
      },
      {
        selector: "edge",
        style: {
          width: 1,
          "line-color": "#475569",
          "target-arrow-color": "#64748b",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          opacity: 0.35,
          "transition-property": "opacity, width",
          "transition-duration": 180,
        },
      },
      {
        selector: "edge:selected",
        style: {
          width: 2,
          opacity: 1,
          "line-color": "#f8fafc",
          "target-arrow-color": "#f8fafc",
        },
      },
    ],
  });
  cy.on("mouseover", "node", (event) => {
    const node = event.target;
    cy.elements().addClass("faded");
    node.closedNeighborhood().removeClass("faded");
    node.addClass("hovered");
  });
  cy.on("mouseout", "node", (event) => {
    event.target.removeClass("hovered");
    cy.elements().removeClass("faded");
  });
  cy.on("tap", "node", (event) => onSelect(event.target.id()));
  return cy;
}

export function KnowledgeSystemPage() {
  const { auth, loading: authLoading } = useAuth();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [selected, setSelected] = useState<KnowledgeGraphNode | null>(null);
  const [query, setQuery] = useState("");
  const [domains, setDomains] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const graphInstanceRef = useRef<Core | null>(null);

  const load = useCallback(async () => {
    if (!auth) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/kody/knowledge-system", {
        headers: buildAuthHeaders(auth),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not load the knowledge graph.");
      const data = (await response.json()) as { bundle: Bundle | null };
      setBundle(data.bundle);
      if (!data.bundle) {
        setGraph(null);
        return;
      }
      const graphResponse = await fetch(data.bundle.graphUrl, {
        cache: "no-store",
      });
      if (!graphResponse.ok)
        throw new Error("Could not download the knowledge graph.");
      setGraph(parseGraphifyGraph(await graphResponse.json()));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load the knowledge graph.",
      );
    } finally {
      setLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  const availableDomains = useMemo(
    () =>
      Array.from(new Set(graph?.nodes.map((node) => node.domain) ?? [])).sort(),
    [graph],
  );
  const filtered = useMemo(
    () => (graph ? filterKnowledgeGraph(graph, query, domains) : null),
    [graph, query, domains],
  );
  useEffect(() => {
    const container = graphContainerRef.current;
    if (!container || !filtered) return;

    graphInstanceRef.current?.destroy();
    graphInstanceRef.current = mountGraph(container, filtered, (nodeId) => {
      setSelected(graph?.nodes.find((node) => node.id === nodeId) ?? null);
    });

    return () => {
      graphInstanceRef.current?.destroy();
      graphInstanceRef.current = null;
    };
  }, [filtered, graph]);

  const refresh = async () => {
    if (!auth || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch(
        "/api/kody/agency-loops/knowledge-system-refresh/run",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...buildAuthHeaders(auth),
          },
          body: JSON.stringify({ force: true }),
        },
      );
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(
            "The knowledge-system-refresh Loop is not installed for this repository.",
          );
        }
        throw new Error("Could not start the graph refresh.");
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not start the graph refresh.",
      );
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Knowledge System
          </h1>
          <p className="text-sm text-muted-foreground">
            {bundle
              ? `Last updated ${new Date(bundle.generatedAt).toLocaleString()}`
              : "No graph published yet"}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={refresh}
          disabled={!auth || refreshing}
        >
          <RefreshCw
            className={`mr-2 size-4 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh graph
        </Button>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search graph"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search nodes"
            className="pl-9"
          />
        </div>
        {availableDomains.map((domain) => {
          const active = domains.includes(domain);
          return (
            <Button
              key={domain}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              aria-pressed={active}
              onClick={() =>
                setDomains((current) =>
                  active
                    ? current.filter((item) => item !== domain)
                    : [...current, domain],
                )
              }
            >
              {domain}
            </Button>
          );
        })}
      </div>

      <section
        aria-label="Repository knowledge graph"
        className="relative min-h-[520px] flex-1 overflow-hidden rounded-xl border bg-slate-950"
      >
        {loading || authLoading ? (
          <div className="grid h-full min-h-[520px] place-items-center text-sm text-muted-foreground">
            Loading graph…
          </div>
        ) : !graph ? (
          <div className="grid h-full min-h-[520px] place-items-center px-6 text-center text-sm text-muted-foreground">
            Run the knowledge-system-refresh Loop to build this repository's
            first graph.
          </div>
        ) : (
          <>
            <div
              ref={graphContainerRef}
              data-testid="knowledge-graph-canvas"
              className="h-full min-h-[520px] w-full"
              aria-label="Interactive knowledge graph"
            />
            <div className="absolute bottom-3 left-3 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                data-testid="knowledge-graph-fit"
                onClick={() => graphInstanceRef.current?.fit(undefined, 40)}
              >
                Fit graph
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                data-testid="knowledge-graph-relayout"
                onClick={() => {
                  const instance = graphInstanceRef.current;
                  if (!instance) return;
                  instance
                    .layout({
                      name: "fcose",
                      quality: "draft",
                      randomize: false,
                      animate: true,
                      animationDuration: 900,
                      numIter: (filtered?.nodes.length ?? 0) > 2_000 ? 40 : 100,
                      nodeSeparation: 60,
                      fit: true,
                    } as LayoutOptions)
                    .run();
                }}
              >
                Re-layout
              </Button>
            </div>
          </>
        )}
      </section>

      {selected ? (
        <aside
          aria-label="Selected node details"
          className="rounded-xl border p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">{selected.label}</p>
              <p className="text-xs text-muted-foreground">
                {selected.domain}
                {selected.type ? ` · ${selected.type}` : ""}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSelected(null)}
            >
              Close
            </Button>
          </div>
          {selected.description ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {selected.description}
            </p>
          ) : null}
          {selected.sourceFile ? (
            <p className="mt-2 break-all font-mono text-xs">
              {selected.sourceFile}
              {selected.sourceLocation ? `:${selected.sourceLocation}` : ""}
            </p>
          ) : null}
        </aside>
      ) : null}
    </main>
  );
}

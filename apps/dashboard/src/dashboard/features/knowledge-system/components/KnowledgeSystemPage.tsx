"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";
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
const MAX_VISIBLE_NODES = 1_500;

function graphElements(graph: KnowledgeGraph): {
  nodes: Node[];
  edges: Edge[];
} {
  const visibleNodes = graph.nodes.slice(0, MAX_VISIBLE_NODES);
  const ids = new Set(visibleNodes.map((node) => node.id));
  const columns = Math.max(1, Math.ceil(Math.sqrt(visibleNodes.length)));
  return {
    nodes: visibleNodes.map((node, index) => ({
      id: node.id,
      position: {
        x: (index % columns) * 210,
        y: Math.floor(index / columns) * 100,
      },
      data: { label: node.label },
      style: {
        width: 180,
        border: `1px solid ${DOMAIN_COLORS[node.domain] ?? DOMAIN_COLORS.other}`,
        borderRadius: 10,
        background: "#111827",
        color: "#e5e7eb",
        fontSize: 12,
      },
    })),
    edges: graph.edges
      .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.relation,
        style: { stroke: "#475569" },
      })),
  };
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
  const elements = useMemo(
    () => (filtered ? graphElements(filtered) : { nodes: [], edges: [] }),
    [filtered],
  );

  const refresh = async () => {
    if (!auth || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch(
        "/api/kody/capabilities/knowledge-system-refresh/run",
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
            "The knowledge-system-refresh capability is not installed for this repository.",
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

  const onNodeClick: NodeMouseHandler = (_event, node) => {
    setSelected(graph?.nodes.find((item) => item.id === node.id) ?? null);
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
            Run the knowledge-system-refresh capability to build this
            repository's first graph.
          </div>
        ) : (
          <ReactFlow
            nodes={elements.nodes}
            edges={elements.edges}
            onNodeClick={onNodeClick}
            nodesDraggable={false}
            nodesConnectable={false}
            fitView
            minZoom={0.05}
          >
            <Background color="#334155" gap={24} />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
        {filtered && filtered.nodes.length > MAX_VISIBLE_NODES ? (
          <p className="absolute bottom-3 left-3 rounded bg-background/90 px-2 py-1 text-xs text-muted-foreground">
            Showing the first {MAX_VISIBLE_NODES.toLocaleString()} matching
            nodes. Narrow the graph with search or a domain.
          </p>
        ) : null}
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

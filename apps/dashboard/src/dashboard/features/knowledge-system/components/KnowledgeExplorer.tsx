"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Network, Search, X } from "lucide-react";
import { Button } from "@kody-ade/base/ui/button";
import { Input } from "@kody-ade/base/ui/input";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@kody-ade/base/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@kody-ade/base/ui/select";
import { PageShell } from "@dashboard/lib/components/PageShell";
import {
  KNOWLEDGE_DOMAINS,
  createKnowledgeNeighborhood,
  getKnowledgeNodeRelations,
  type KnowledgeDomain,
  type KnowledgeGraph,
  type KnowledgeNode,
  type KnowledgeQuery,
} from "../model/knowledge-graph";
import {
  KNOWLEDGE_AREA_LABELS,
  createKnowledgeAreaMap,
  selectKnowledgeResults,
  type KnowledgeView,
} from "../model/knowledge-graph-projections";
import { KnowledgeGraphCanvas } from "./KnowledgeGraphCanvas";

export type KnowledgeDomainStatus = {
  domain: KnowledgeDomain;
  generatedAt: string;
  nodeCount: number;
  edgeCount: number;
  status: "ready" | "stale" | "unavailable";
};

const LAYER_OPTIONS: Array<{ value: KnowledgeView; label: string }> = [
  { value: "overall", label: "All layers" },
  ...KNOWLEDGE_DOMAINS.map((domain) => ({
    value: domain,
    label: KNOWLEDGE_AREA_LABELS[domain],
  })),
];

function replaceSelection(view: KnowledgeView, entityId?: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("view", view);
  if (entityId) url.searchParams.set("entity", entityId);
  else url.searchParams.delete("entity");
  window.history.replaceState(null, "", url);
}

export function KnowledgeExplorer({
  graph: initialGraph,
  generatedAt,
  nodeCount,
  edgeCount,
  error,
  loadGraph,
}: {
  graph: KnowledgeGraph;
  domains?: KnowledgeDomainStatus[];
  generatedAt: string;
  nodeCount: number;
  edgeCount: number;
  error?: string | null;
  loadGraph: (query: KnowledgeQuery) => Promise<KnowledgeGraph>;
}) {
  const [graph, setGraph] = useState(initialGraph);
  const [view, setView] = useState<KnowledgeView>("overall");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [querying, setQuerying] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const initializedRef = useRef(false);

  useEffect(() => {
    setGraph(initialGraph);
  }, [initialGraph]);

  const query = useCallback(
    async (knowledgeQuery: KnowledgeQuery) => {
      const requestId = ++requestIdRef.current;
      setQuerying(true);
      setQueryError(null);
      try {
        const nextGraph = await loadGraph(knowledgeQuery);
        if (requestId === requestIdRef.current) setGraph(nextGraph);
        return nextGraph;
      } catch (cause) {
        if (requestId === requestIdRef.current) {
          setQueryError(
            cause instanceof Error
              ? cause.message
              : "Could not query the published knowledge.",
          );
        }
        return null;
      } finally {
        if (requestId === requestIdRef.current) setQuerying(false);
      }
    },
    [loadGraph],
  );

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const params = new URL(window.location.href).searchParams;
    const requestedView = params.get("view");
    const requestedEntity = params.get("entity");
    const nextView: KnowledgeView =
      requestedView === "overall" ||
      KNOWLEDGE_DOMAINS.includes(requestedView as KnowledgeDomain)
        ? (requestedView as KnowledgeView)
        : "overall";
    const entity =
      initialGraph.nodes.find((node) => node.id === requestedEntity) ?? null;
    setView(entity?.domain ?? nextView);
    setSelectedId(entity?.id ?? null);
  }, [initialGraph.nodes]);

  useEffect(() => {
    const searchQuery = search.trim();
    if (!searchQuery) return;
    const timer = window.setTimeout(() => {
      void query({ search: searchQuery, depth: 1, limit: 80 });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, search]);

  const selected = useMemo(
    () => graph.nodes.find((node) => node.id === selectedId) ?? null,
    [graph.nodes, selectedId],
  );
  const searchResults = useMemo(
    () =>
      search.trim()
        ? selectKnowledgeResults(graph, {
            domain: "overall",
            query: search,
          }).slice(0, 6)
        : [],
    [graph, search],
  );
  const visibleGraph = useMemo(
    () =>
      selected
        ? createKnowledgeNeighborhood(graph, selected.id, {
            depth: 1,
            limit: 30,
          })
        : graph,
    [graph, selected],
  );
  const map = useMemo(
    () =>
      createKnowledgeAreaMap(
        visibleGraph,
        selected ? selected.domain : view,
      ),
    [selected, view, visibleGraph],
  );
  const relations = useMemo(
    () => (selected ? getKnowledgeNodeRelations(graph, selected.id) : []),
    [graph, selected],
  );

  const selectView = useCallback(
    (next: KnowledgeView) => {
      setView(next);
      setSelectedId(null);
      setSearch("");
      replaceSelection(next);
      void query(
        next === "overall"
          ? { overview: true }
          : { domain: next, limit: 160 },
      );
    },
    [query],
  );
  const selectEntity = useCallback(
    (id: string) => {
      if (id.startsWith("domain:")) {
        selectView(id.slice("domain:".length) as KnowledgeDomain);
        return;
      }
      const entity = graph.nodes.find((node) => node.id === id);
      if (!entity) return;
      setView(entity.domain);
      setSelectedId(id);
      setSearch("");
      replaceSelection(entity.domain, id);
    },
    [graph.nodes, selectView],
  );

  return (
    <PageShell
      title="Knowledge System"
      subtitle={`${nodeCount.toLocaleString()} entities · ${edgeCount.toLocaleString()} relations`}
      icon={Network}
      iconClassName="text-cyan-400"
      width="full"
      contentClassName="flex min-h-0 flex-col gap-4 overflow-hidden p-4 md:p-5"
    >
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {queryError ? (
        <p role="alert" className="text-sm text-destructive">
          {queryError}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="md:hidden">
          <Select
            value={view}
            onValueChange={(value) => selectView(value as KnowledgeView)}
          >
            <SelectTrigger aria-label="Knowledge layer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LAYER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Tabs
          value={view}
          onValueChange={(value) => selectView(value as KnowledgeView)}
          className="hidden min-w-0 overflow-x-auto md:block"
        >
          <TabsList aria-label="Knowledge layers" className="w-max">
            {LAYER_OPTIONS.map((option) => (
              <TabsTrigger key={option.value} value={option.value}>
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <KnowledgeSearch
          value={search}
          results={searchResults}
          onChange={setSearch}
          onSelect={selectEntity}
        />
      </div>

      <div className="flex h-[60vh] min-h-[440px] max-h-[560px] flex-col overflow-hidden rounded-lg border border-border bg-slate-950 lg:h-auto lg:max-h-none lg:min-h-0 lg:flex-1 lg:flex-row">
        <section className="relative min-h-[440px] flex-1 lg:min-h-0">
          {querying ? (
            <p
              role="status"
              className="absolute left-3 top-3 z-20 rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground"
            >
              Loading knowledge…
            </p>
          ) : null}
          <KnowledgeGraphCanvas
            map={map}
            selectedId={selected?.id}
            onNodeSelect={selectEntity}
          />
        </section>

        {selected ? (
          <KnowledgeEntityDetail
            entity={selected}
            relations={relations}
            onClose={() => {
              setSelectedId(null);
              replaceSelection(view);
              void query(
                view === "overall"
                  ? { overview: true }
                  : { domain: view, limit: 160 },
              );
            }}
            onSelect={selectEntity}
          />
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Updated {new Date(generatedAt).toLocaleString()}
      </p>
    </PageShell>
  );
}

function KnowledgeSearch({
  value,
  results,
  onChange,
  onSelect,
}: {
  value: string;
  results: KnowledgeNode[];
  onChange: (value: string) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="relative w-full xl:w-80">
      <Search className="pointer-events-none absolute left-3 top-2.5 z-10 h-4 w-4 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Find an entity..."
        aria-label="Find knowledge"
        className="pl-9"
      />
      {value.trim() ? (
        <div className="absolute right-0 top-11 z-30 w-full overflow-hidden rounded-md border border-border bg-popover shadow-xl">
          {results.length ? (
            results.map((result) => (
              <Button
                key={result.id}
                type="button"
                variant="ghost"
                size="clear"
                className="flex h-auto w-full justify-start rounded-none px-3 py-2 text-left"
                onClick={() => onSelect(result.id)}
              >
                <span>
                  <span className="block text-sm text-foreground">
                    {result.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {KNOWLEDGE_AREA_LABELS[result.domain]} ·{" "}
                    {result.type.replaceAll("_", " ").replaceAll("-", " ")}
                  </span>
                </span>
              </Button>
            ))
          ) : (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              No matching knowledge.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function KnowledgeEntityDetail({
  entity,
  relations,
  onClose,
  onSelect,
}: {
  entity: KnowledgeNode;
  relations: ReturnType<typeof getKnowledgeNodeRelations>;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="max-h-[44vh] w-full shrink-0 overflow-y-auto border-t border-border bg-background p-4 lg:max-h-none lg:w-80 lg:border-l lg:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-cyan-400">
            {KNOWLEDGE_AREA_LABELS[entity.domain]} ·{" "}
            {entity.type.replaceAll("_", " ").replaceAll("-", " ")}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">
            {entity.label}
          </h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Close entity details"
          className="h-8 w-8 px-0"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {entity.summary ?? entity.description ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {entity.summary ?? entity.description}
        </p>
      ) : null}

      <section className="mt-6">
        <h3 className="text-sm font-medium text-foreground">Relationships</h3>
        <div className="mt-2 space-y-1">
          {relations.length ? (
            relations.slice(0, 12).map((relation) => (
              <Button
                key={`${relation.direction}:${relation.relation}:${relation.node.id}`}
                type="button"
                variant="ghost"
                size="clear"
                className="block h-auto w-full whitespace-normal px-0 py-1 text-left text-sm text-muted-foreground hover:text-foreground"
                onClick={() => onSelect(relation.node.id)}
              >
                {relation.direction === "incoming" ? "←" : "→"}{" "}
                {relation.relation.replaceAll("-", " ")}{" "}
                <span className="text-foreground">{relation.node.label}</span>
              </Button>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No relationships recorded.
            </p>
          )}
        </div>
      </section>

      <section className="mt-6">
        <h3 className="text-sm font-medium text-foreground">Source evidence</h3>
        <div className="mt-2 space-y-2 text-sm text-muted-foreground">
          {entity.sources?.length ? (
            entity.sources.map((source) => {
              const resource = source.resource ?? entity.resource;
              const label = (
                <>
                  <span className="text-foreground">{source.kind}</span> ·{" "}
                  {source.id}
                </>
              );
              return resource ? (
                <a
                  key={`${source.kind}:${source.id}`}
                  href={resource}
                  target="_blank"
                  rel="noreferrer"
                  className="block break-words text-cyan-400 hover:underline"
                >
                  {label}
                </a>
              ) : (
                <p
                  key={`${source.kind}:${source.id}`}
                  className="break-words"
                >
                  {label}
                </p>
              );
            })
          ) : (
            <p className="text-amber-300">
              Legacy entity without source evidence.
            </p>
          )}
        </div>
      </section>
    </aside>
  );
}

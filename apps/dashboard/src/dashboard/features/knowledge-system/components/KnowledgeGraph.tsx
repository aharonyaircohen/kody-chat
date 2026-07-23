"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@kody-ade/base/ui/button";
import { Input } from "@kody-ade/base/ui/input";
import {
  findKnowledgeNodes,
  getKnowledgeNodeRelations,
  type KnowledgeGraph as KnowledgeGraphData,
} from "../model/knowledge-graph";
import {
  classifyKnowledgeNode,
  createKnowledgeAreaMap,
  getKnowledgeAreas,
  KNOWLEDGE_AREA_LABELS,
  type KnowledgeView,
} from "../model/knowledge-graph-projections";
import { KnowledgeGraphCanvas } from "./KnowledgeGraphCanvas";

const OVERALL_LABEL = "Overall";

export function KnowledgeGraph({ graph }: { graph: KnowledgeGraphData }) {
  const [view, setView] = useState<KnowledgeView>("overall");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const availableAreas = useMemo(() => getKnowledgeAreas(graph), [graph]);
  const map = useMemo(() => createKnowledgeAreaMap(graph, view), [graph, view]);
  const selected = useMemo(
    () => graph.nodes.find((node) => node.id === selectedId) ?? null,
    [graph.nodes, selectedId],
  );
  const selectedRelations = useMemo(
    () => (selected ? getKnowledgeNodeRelations(graph, selected.id) : []),
    [graph, selected],
  );

  const selectView = (next: KnowledgeView) => {
    setView(next);
    setSelectedId(null);
  };

  const focusSearchResult = () => {
    const match = findKnowledgeNodes(graph, search)[0];
    if (!match) return;
    setView(classifyKnowledgeNode(match));
    setSelectedId(match.id);
  };

  const handleNodeSelect = useCallback(
    (id: string) => {
      if (graph.nodes.some((node) => node.id === id)) setSelectedId(id);
    },
    [graph.nodes],
  );

  const entityCount = map.nodes.filter((node) => node.kind === "entity").length;
  const areaCount = map.nodes.filter((node) => node.kind === "area").length;
  const summary =
    view === "overall"
      ? `${entityCount.toLocaleString()} entities · ${areaCount.toLocaleString()} areas`
      : `${entityCount.toLocaleString()} visible entities`;

  return (
    <div
      data-testid="knowledge-graph"
      className="flex h-full min-h-[560px] flex-col bg-slate-950"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 p-3">
        <div
          role="tablist"
          aria-label="Knowledge graph view"
          className="flex flex-wrap gap-2"
        >
          <Button
            type="button"
            role="tab"
            size="sm"
            variant={view === "overall" ? "default" : "outline"}
            aria-selected={view === "overall"}
            onClick={() => selectView("overall")}
          >
            {OVERALL_LABEL}
          </Button>
          {availableAreas.map((area) => (
            <Button
              key={area}
              type="button"
              role="tab"
              size="sm"
              variant={view === area ? "default" : "outline"}
              aria-selected={view === area}
              onClick={() => selectView(area)}
            >
              {KNOWLEDGE_AREA_LABELS[area]}
            </Button>
          ))}
        </div>

        <div className="flex min-w-56 flex-1 items-center gap-2">
          <Input
            aria-label="Find an entity"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") focusSearchResult();
            }}
            placeholder="Find an entity…"
            className="h-9"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={focusSearchResult}
            disabled={!search.trim()}
          >
            Focus
          </Button>
        </div>

        <span
          data-testid="knowledge-view-summary"
          className="ml-auto text-xs text-slate-400"
        >
          {summary}
        </span>
      </div>

      <div className="relative flex-1">
        {map.nodes.length > 0 ? (
          <KnowledgeGraphCanvas
            map={map}
            selectedId={selectedId}
            onNodeSelect={handleNodeSelect}
          />
        ) : (
          <div className="grid h-full min-h-[500px] place-items-center text-sm text-slate-400">
            No connected knowledge is available for this view.
          </div>
        )}

        <p className="pointer-events-none absolute bottom-3 right-3 rounded bg-slate-950/80 px-2 py-1 text-xs text-slate-500">
          Scroll to zoom · labels appear as you get closer
        </p>

        {selected ? (
          <aside className="absolute bottom-3 left-3 max-w-sm rounded-lg border border-slate-700 bg-slate-900/95 p-3 shadow-xl">
            <p className="font-medium text-slate-100">{selected.label}</p>
            <p className="mt-1 text-xs text-slate-400">
              {KNOWLEDGE_AREA_LABELS[classifyKnowledgeNode(selected)]} ·{" "}
              {selected.type.replaceAll("-", " ")}
            </p>
            {selected.description ? (
              <p className="mt-2 text-sm text-slate-300">
                {selected.description}
              </p>
            ) : null}
            {selectedRelations.length > 0 ? (
              <ul className="mt-3 space-y-1 border-t border-slate-700 pt-2 text-xs text-slate-300">
                {selectedRelations.slice(0, 10).map((relation) => (
                  <li
                    key={`${relation.direction}:${relation.relation}:${relation.node.id}`}
                  >
                    {relation.direction === "incoming" ? "←" : "→"}{" "}
                    {relation.relation.replaceAll("-", " ")}{" "}
                    <span className="text-slate-100">
                      {relation.node.label}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {selected.resource ? (
              <a
                href={selected.resource}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm text-sky-400 hover:underline"
              >
                Open source
              </a>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

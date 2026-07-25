"use client";

import { useCallback, useEffect, useState } from "react";
import { buildAuthHeaders, useAuth } from "@dashboard/lib/auth-context";
import {
  parseKnowledgeGraph,
  type KnowledgeGraph as KnowledgeGraphData,
} from "../model/knowledge-graph";
import { KnowledgeGraph } from "./KnowledgeGraph";

type Bundle = {
  graphUrl: string;
  htmlUrl: string | null;
  reportUrl: string | null;
  generatedAt: string;
  nodeCount: number;
  edgeCount: number;
  sourceRevision?: string;
};

export function KnowledgeSystemPage() {
  const { auth, loading: authLoading } = useAuth();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [graph, setGraph] = useState<KnowledgeGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!auth) {
      setBundle(null);
      setGraph(null);
      setLoading(false);
      return;
    }

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
      if (!graphResponse.ok) {
        throw new Error("Could not load the published graph data.");
      }
      setGraph(parseKnowledgeGraph(await graphResponse.json()));
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

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Knowledge System
          </h1>
          <p className="text-sm text-muted-foreground">
            {bundle
              ? `Last updated ${new Date(bundle.generatedAt).toLocaleString()} · ${bundle.nodeCount.toLocaleString()} nodes · ${bundle.edgeCount.toLocaleString()} relations`
              : "No graph published yet"}
          </p>
        </div>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <section
        aria-label="Repository knowledge graph"
        className="relative min-h-[520px] flex-1 overflow-hidden rounded-xl border bg-slate-950"
      >
        {loading || authLoading ? (
          <div className="grid h-full min-h-[520px] place-items-center text-sm text-muted-foreground">
            Loading graph…
          </div>
        ) : !bundle || !graph ? (
          <div className="grid h-full min-h-[520px] place-items-center px-6 text-center text-sm text-muted-foreground">
            A graph will appear here after it is published for this repository.
          </div>
        ) : (
          <KnowledgeGraph graph={graph} />
        )}
      </section>
    </main>
  );
}

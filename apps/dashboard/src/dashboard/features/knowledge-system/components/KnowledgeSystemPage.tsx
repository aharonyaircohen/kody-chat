"use client";

import { useCallback, useEffect, useState } from "react";
import { buildAuthHeaders, useAuth } from "@dashboard/lib/auth-context";
import {
  KNOWLEDGE_DOMAINS,
  parseKnowledgeGraph,
  type KnowledgeDomain,
  type KnowledgeGraph as KnowledgeGraphData,
  type KnowledgeQuery,
} from "../model/knowledge-graph";
import {
  KnowledgeExplorer,
  type KnowledgeDomainStatus,
} from "./KnowledgeExplorer";

type Bundle = {
  graphUrl: string;
  htmlUrl: string | null;
  reportUrl: string | null;
  generatedAt: string;
  nodeCount: number;
  edgeCount: number;
  sourceRevision?: string;
  schemaVersion?: number;
  domains?: Array<
    KnowledgeDomainStatus & {
      graphUrl: string | null;
      sourceRevision?: string;
    }
  >;
};

export function KnowledgeSystemPage() {
  const { auth, loading: authLoading } = useAuth();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [graph, setGraph] = useState<KnowledgeGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryGraph = useCallback(
    async (query: KnowledgeQuery): Promise<KnowledgeGraphData> => {
      if (!auth) throw new Error("Repository authentication is unavailable.");
      const response = await fetch("/api/kody/knowledge-system/query", {
        method: "POST",
        headers: {
          ...buildAuthHeaders(auth),
          "content-type": "application/json",
        },
        body: JSON.stringify(query),
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Could not query the published knowledge.");
      }
      const payload = (await response.json()) as { graph: unknown };
      return parseKnowledgeGraph(payload.graph);
    },
    [auth],
  );

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

      const params = new URL(window.location.href).searchParams;
      const entityId = params.get("entity");
      const requestedView = params.get("view");
      const domain = KNOWLEDGE_DOMAINS.includes(
        requestedView as KnowledgeDomain,
      )
        ? (requestedView as KnowledgeDomain)
        : null;
      setGraph(
        await queryGraph(
          entityId
            ? { entityId, depth: 1, limit: 60 }
            : domain
              ? { domain, limit: 160 }
              : { overview: true },
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load the knowledge graph.",
      );
    } finally {
      setLoading(false);
    }
  }, [auth, queryGraph]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  if (loading || authLoading) {
    return (
      <main className="grid h-full min-h-[520px] place-items-center text-sm text-muted-foreground">
        Loading graph…
      </main>
    );
  }
  if (!bundle || !graph) {
    return (
      <main className="grid h-full min-h-[520px] place-items-center px-6 text-center text-sm text-muted-foreground">
        {error ??
          "A graph will appear here after it is published for this repository."}
      </main>
    );
  }
  return (
    <KnowledgeExplorer
      graph={graph}
      domains={bundle.domains as
        | Array<KnowledgeDomainStatus & { domain: KnowledgeDomain }>
        | undefined}
      generatedAt={bundle.generatedAt}
      nodeCount={bundle.nodeCount}
      edgeCount={bundle.edgeCount}
      error={error}
      loadGraph={queryGraph}
    />
  );
}

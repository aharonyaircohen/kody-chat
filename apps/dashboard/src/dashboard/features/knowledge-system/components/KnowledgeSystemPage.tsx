"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@kody-ade/base/ui/button";
import { buildAuthHeaders, useAuth } from "@dashboard/lib/auth-context";

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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!auth) {
      setBundle(null);
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
              ? `Last updated ${new Date(bundle.generatedAt).toLocaleString()} · ${bundle.nodeCount.toLocaleString()} nodes · ${bundle.edgeCount.toLocaleString()} relations`
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

      <section
        aria-label="Repository knowledge graph"
        className="relative min-h-[520px] flex-1 overflow-hidden rounded-xl border bg-slate-950"
      >
        {loading || authLoading ? (
          <div className="grid h-full min-h-[520px] place-items-center text-sm text-muted-foreground">
            Loading graph…
          </div>
        ) : !bundle ? (
          <div className="grid h-full min-h-[520px] place-items-center px-6 text-center text-sm text-muted-foreground">
            Run the knowledge-system-refresh Loop to build this
            repository&apos;s first graph.
          </div>
        ) : bundle.htmlUrl ? (
          <iframe
            src={bundle.htmlUrl}
            title="Interactive repository knowledge graph"
            data-testid="knowledge-graph-frame"
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            className="h-full min-h-[520px] w-full border-0 bg-slate-950"
          />
        ) : (
          <div className="grid h-full min-h-[520px] place-items-center px-6 text-center text-sm text-muted-foreground">
            Refresh the Knowledge System to publish Graphify&apos;s rich
            visualization.
          </div>
        )}
      </section>
    </main>
  );
}

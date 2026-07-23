"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Cpu,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@kody-ade/base/ui/badge";
import { Button } from "@kody-ade/base/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@kody-ade/base/ui/card";
import { EmptyState } from "@dashboard/lib/components/EmptyState";
import { buildAuthHeaders, useAuth } from "@dashboard/lib/auth-context";
import { selectionPath } from "@dashboard/lib/selection-routing";

type ImplementationSummary = {
  id: string;
  capabilityId: string;
  compatibleCapabilityRevision: string;
  type: "agent" | "script";
  agentId?: string;
  htmlUrl: string;
  selected: boolean;
  selection: "repository" | "automatic" | "available";
};

type ImplementationDetail = ImplementationSummary & {
  definition: Record<string, unknown>;
  runtime: Record<string, unknown> | null;
  promptTemplate: string | null;
  files: string[];
  repositoryBinding: string | null;
};

async function readJson<T>(
  url: string,
  headers: Record<string, string>,
): Promise<T> {
  const response = await fetch(url, { headers, cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(
      payload.message || payload.error || `HTTP ${response.status}`,
    );
  }
  return payload;
}

export function ImplementationsView({
  selectedId,
}: {
  selectedId?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { auth } = useAuth();
  const headers = useMemo(() => buildAuthHeaders(auth), [auth]);
  const list = useQuery({
    queryKey: ["agency-implementations", auth?.owner, auth?.repo],
    queryFn: async () =>
      (
        await readJson<{ implementations: ImplementationSummary[] }>(
          "/api/kody/implementations",
          headers,
        )
      ).implementations,
    enabled: Boolean(auth),
    staleTime: 30_000,
  });
  const detail = useQuery({
    queryKey: [
      "agency-implementation",
      auth?.owner,
      auth?.repo,
      selectedId,
    ],
    queryFn: async () =>
      (
        await readJson<{ implementation: ImplementationDetail }>(
          `/api/kody/implementations/${encodeURIComponent(selectedId!)}`,
          headers,
        )
      ).implementation,
    enabled: Boolean(auth && selectedId),
    staleTime: 30_000,
  });
  const select = useMutation({
    mutationFn: async (implementation: ImplementationSummary) => {
      const response = await fetch("/api/kody/store-catalog/import", {
        method: "POST",
        headers,
        body: JSON.stringify({
          kind: "implementation",
          slug: implementation.id,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(
          payload.message || payload.error || `HTTP ${response.status}`,
        );
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["agency-implementations", auth?.owner, auth?.repo],
      });
      await queryClient.invalidateQueries({
        queryKey: ["agency-implementation", auth?.owner, auth?.repo],
      });
      toast.success("Implementation selected");
    },
    onError: (error) =>
      toast.error("Could not select Implementation", {
        description: error.message,
      }),
  });

  if (list.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (list.error) {
    return (
      <EmptyState
        icon={<RefreshCw className="h-5 w-5" />}
        title="Could not load Implementations"
        hint={list.error.message}
        action={<Button onClick={() => void list.refetch()}>Retry</Button>}
      />
    );
  }

  const implementations = list.data ?? [];
  const selectedSummary =
    implementations.find((item) => item.id === selectedId) ?? null;

  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(18rem,24rem)_1fr]">
      <aside className="border-r border-border/70">
        <header className="border-b border-border/70 p-4">
          <h1 className="text-xl font-semibold">Implementations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {implementations.length} technical execution models in the Store
          </p>
        </header>
        {implementations.length === 0 ? (
          <EmptyState
            icon={<Cpu className="h-5 w-5" />}
            title="No Implementations"
            hint="The connected Store does not contain Implementation models."
          />
        ) : (
          <div className="divide-y divide-border/60">
            {implementations.map((implementation) => (
              <Button
                key={implementation.id}
                type="button"
                variant="ghost"
                className={`h-auto w-full justify-start rounded-none px-4 py-4 text-left whitespace-normal hover:bg-muted/40 ${
                  selectedSummary?.id === implementation.id
                    ? "bg-muted/60"
                    : ""
                }`}
                onClick={() =>
                  router.push(
                    selectionPath("/implementations", implementation.id),
                  )
                }
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mono text-sm font-medium">
                      {implementation.id}
                    </span>
                    {implementation.selected ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : null}
                  </div>
                  <p className="mt-2 truncate text-xs text-muted-foreground">
                    {implementation.type} · {implementation.capabilityId}
                  </p>
                </div>
              </Button>
            ))}
          </div>
        )}
      </aside>
      <main className="min-w-0 p-4 md:p-8">
        {!selectedId ? (
          <EmptyState
            icon={<Cpu className="h-5 w-5" />}
            title="Select an Implementation"
            hint="Choose an execution model to inspect its runtime and Capability compatibility."
          />
        ) : detail.isLoading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : detail.error || !detail.data ? (
          <EmptyState
            icon={<RefreshCw className="h-5 w-5" />}
            title="Could not load Implementation"
            hint={detail.error?.message ?? "Implementation not found"}
            action={<Button onClick={() => void detail.refetch()}>Retry</Button>}
          />
        ) : (
          <ImplementationDetailView
            implementation={detail.data}
            summary={selectedSummary}
            selecting={select.isPending}
            onSelect={() =>
              selectedSummary && select.mutate(selectedSummary)
            }
          />
        )}
      </main>
    </div>
  );
}

function ImplementationDetailView({
  implementation,
  summary,
  selecting,
  onSelect,
}: {
  implementation: ImplementationDetail;
  summary: ImplementationSummary | null;
  selecting: boolean;
  onSelect: () => void;
}) {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-2xl font-semibold">
              {implementation.id}
            </h2>
            <Badge>{implementation.type}</Badge>
            {summary?.selected ? (
              <Badge variant="outline">{summary.selection}</Badge>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Implements{" "}
            <span className="font-mono">{implementation.capabilityId}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {!summary?.selected ? (
            <Button onClick={onSelect} disabled={selecting || !summary}>
              {selecting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Select for repository
            </Button>
          ) : null}
          <Button variant="outline" asChild>
            <a
              href={implementation.htmlUrl}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Store source
            </a>
          </Button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <ValueCard title="Compatible Capability revision">
          <span className="break-all font-mono text-xs">
            {implementation.compatibleCapabilityRevision}
          </span>
        </ValueCard>
        <ValueCard title="Agent">
          {implementation.agentId ?? "Not used by this script Implementation"}
        </ValueCard>
      </div>

      <JsonCard title="Implementation definition" value={implementation.definition} />
      <JsonCard title="Runtime configuration" value={implementation.runtime} />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Prompt template</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-4 font-mono text-xs">
            {implementation.promptTemplate ?? "No prompt template"}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Files</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {implementation.files.map((file) => (
            <Badge key={file} variant="outline">
              {file}
            </Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ValueCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  );
}

function JsonCard({
  title,
  value,
}: {
  title: string;
  value: Record<string, unknown> | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="max-h-96 overflow-auto rounded-lg bg-muted/50 p-4 font-mono text-xs">
          {value ? JSON.stringify(value, null, 2) : "Not configured"}
        </pre>
      </CardContent>
    </Card>
  );
}

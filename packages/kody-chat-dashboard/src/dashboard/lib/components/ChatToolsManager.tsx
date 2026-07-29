"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@kody-ade/base/ui/button";
import { Card, CardContent } from "@kody-ade/base/ui/card";
import { AuthGuard } from "../auth-guard";
import { buildAuthHeaders, useAuth } from "../auth-context";
import { PageShell } from "./PageShell";
import { ConfirmDialog } from "./ConfirmDialog";
import { useState } from "react";

type ChatToolRow = {
  toolId: string;
  name: string;
  title: string;
  description: string;
  handlerKind: "knowledge_graph_search";
  sourceWorkflow: string;
  generatedAt: string;
  nodeCount: number;
  edgeCount: number;
  enabled: boolean;
};

async function request<T>(
  headers: Record<string, string>,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch("/api/kody/chat-tools", {
    ...init,
    headers: { "Content-Type": "application/json", ...headers },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

export function ChatToolsManager() {
  return (
    <AuthGuard>
      <ChatToolsManagerInner />
    </AuthGuard>
  );
}

function ChatToolsManagerInner() {
  const { auth } = useAuth();
  const headers = buildAuthHeaders(auth);
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState<ChatToolRow | null>(null);
  const queryKey = ["chat-tools", auth?.owner, auth?.repo];
  const tools = useQuery({
    queryKey,
    enabled: Boolean(auth),
    queryFn: async () =>
      (await request<{ tools: ChatToolRow[] }>(headers)).tools,
  });
  const refresh = async () => queryClient.invalidateQueries({ queryKey });
  const toggle = useMutation({
    mutationFn: (tool: ChatToolRow) =>
      request(headers, {
        method: "PATCH",
        body: JSON.stringify({ toolId: tool.toolId, enabled: !tool.enabled }),
      }),
    onSuccess: async () => {
      await refresh();
      toast.success("Chat tool updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  async function removeTool(tool: ChatToolRow) {
    const response = await fetch(
      `/api/kody/chat-tools?toolId=${encodeURIComponent(tool.toolId)}`,
      { method: "DELETE", headers },
    );
    if (!response.ok) throw new Error("Failed to remove Chat tool");
  }

  return (
    <PageShell
      title="Chat Tools"
      icon={Bot}
      iconClassName="text-cyan-400"
      subtitle={auth ? `${auth.owner}/${auth.repo}` : undefined}
    >
      <div className="space-y-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Workflows publish tools here. Enable a tool to make its verified data
          available to Kody Chat. Published tools cannot run uploaded code.
        </p>
        {tools.isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading tools…
          </p>
        )}
        {tools.error && (
          <Card className="border-rose-500/30 bg-rose-950/20">
            <CardContent className="p-4 text-sm text-rose-200">
              Couldn&apos;t load Chat tools.{" "}
              <Button variant="link" onClick={() => tools.refetch()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        )}
        {!tools.isLoading && !tools.error && tools.data?.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <Search className="mx-auto h-8 w-8 text-muted-foreground/60" />
              <p className="mt-3 text-sm text-foreground/80">
                No workflow has published a Chat tool yet.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Run the Company Knowledge Graph workflow to create one.
              </p>
            </CardContent>
          </Card>
        )}
        <ul className="space-y-2">
          {tools.data?.map((item) => (
            <li key={item.toolId}>
              <Card>
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{item.title}</p>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                        {item.nodeCount} facts · {item.edgeCount} links
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                    <p className="mt-2 font-mono text-[11px] text-muted-foreground/80">
                      {item.name} · {item.sourceWorkflow}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={item.enabled}
                      aria-label={`${item.enabled ? "Disable" : "Enable"} ${item.title}`}
                      disabled={toggle.isPending}
                      onClick={() => toggle.mutate(item)}
                      className={`relative h-6 w-11 rounded-full border transition ${
                        item.enabled
                          ? "border-cyan-400/60 bg-cyan-500/40"
                          : "border-border bg-muted"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
                          item.enabled ? "left-5" : "left-1"
                        }`}
                      />
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-rose-300"
                      aria-label={`Remove ${item.title}`}
                      onClick={() => setRemoving(item)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </div>
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.title ?? "Chat tool"}?`}
        description="This removes the tool and its published data. Run the source workflow to publish it again."
        confirmLabel="Remove"
        variant="destructive"
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return;
          removeTool(removing)
            .then(refresh)
            .then(() => toast.success("Chat tool removed"))
            .catch((error: Error) => toast.error(error.message))
            .finally(() => setRemoving(null));
        }}
      />
    </PageShell>
  );
}

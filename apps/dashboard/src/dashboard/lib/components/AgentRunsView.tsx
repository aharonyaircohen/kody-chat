"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { Badge } from "@kody-ade/base/ui/badge";
import { Button } from "@kody-ade/base/ui/button";
import { useMemo, useState } from "react";
import type { AgentRun } from "../activity/agent-runs";
import { useAgentRuns } from "../hooks/useAgentRuns";
import { useRepoScopedHref } from "../hooks/useRepoScopedHref";
import { cn } from "../utils";
import { EmptyState } from "./EmptyState";
import { MasterDetailShell } from "./MasterDetailShell";

function when(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

function RunStatus({ status }: { status: AgentRun["status"] }) {
  if (status === "running")
    return <Loader2 className="h-4 w-4 animate-spin text-sky-300" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-rose-300" />;
  return <CheckCircle2 className="h-4 w-4 text-emerald-300" />;
}

export function AgentRunsView({
  active,
  initialRunId,
}: {
  active: boolean;
  initialRunId?: string;
}) {
  const router = useRouter();
  const scopedHref = useRepoScopedHref();
  const { data, isLoading, error } = useAgentRuns(active);
  const [search, setSearch] = useState("");
  const runs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return data?.runs ?? [];
    return (data?.runs ?? []).filter((run) =>
      `${run.agentName} ${run.clientName ?? ""} ${run.repository} ${run.workTitle ?? ""} ${run.summary} ${run.result}`
        .toLowerCase()
        .includes(needle),
    );
  }, [data, search]);
  const selected = runs.find((run) => run.runId === initialRunId);

  return (
    <div className="h-[calc(100vh-12rem)] min-h-[32rem] overflow-hidden rounded-lg border border-white/[0.08]">
      <MasterDetailShell
        embedded
        title="Agent runs"
        icon={Bot}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search agent runs..."
        searchAriaLabel="Search agent runs"
        accent="violet"
        hasSelection={Boolean(selected)}
        error={error instanceof Error ? error.message : undefined}
        detail={
          selected ? (
            <AgentRunDetail run={selected} />
          ) : (
            <EmptyState
              icon={<Bot />}
              title="Select an agent run"
              hint="Choose a run to inspect its outcome and MCP calls."
            />
          )
        }
      >
        {isLoading ? (
          <EmptyState
            icon={<Loader2 className="animate-spin" />}
            title="Loading agent runs..."
          />
        ) : runs.length === 0 ? (
          <EmptyState
            icon={<Bot />}
            title="No agent runs yet"
            hint="Coding-agent MCP activity will appear here."
          />
        ) : (
          <ul className="divide-y divide-border">
            {runs.map((run) => (
              <li key={run.runId}>
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    "h-auto w-full rounded-none px-4 py-3 text-left hover:bg-accent/50",
                    selected?.runId === run.runId && "bg-accent/70",
                  )}
                  onClick={() =>
                    router.push(scopedHref(`/activity/agents/${run.runId}`))
                  }
                >
                  <div className="flex items-center gap-2">
                    <RunStatus status={run.status} />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {run.agentName}
                    </span>
                    <Badge variant="outline">{run.status}</Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {run.workTitle ?? run.summary}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {run.callCount} MCP {run.callCount === 1 ? "call" : "calls"}{" "}
                    · {when(run.startedAt)}
                  </p>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </MasterDetailShell>
    </div>
  );
}

function AgentRunDetail({ run }: { run: AgentRun }) {
  const [owner = "", repo = ""] = run.repository.split("/", 2);
  return (
    <article className="space-y-6 p-5 md:p-7">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <RunStatus status={run.status} />
          <Badge variant="outline">{run.status}</Badge>
          <span className="text-xs text-muted-foreground">
            {run.repository}
          </span>
        </div>
        <h2 className="mt-3 text-xl font-semibold">
          {run.workTitle ?? `${run.agentName} run`}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{run.summary}</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Agent</dt>
            <dd>{run.agentName}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Result</dt>
            <dd>{run.result}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Started</dt>
            <dd>{when(run.startedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Ended</dt>
            <dd>{run.endedAt ? when(run.endedAt) : "Still running"}</dd>
          </div>
        </dl>
        {run.workRecordId ? (
          <Link
            className="mt-4 inline-flex text-sm text-primary underline underline-offset-2"
            href={`/repo/${owner}/${repo}/shared-work/${run.workRecordId}`}
          >
            Open Shared Work
          </Link>
        ) : null}
      </header>

      <section>
        <h3 className="mb-2 text-sm font-semibold">MCP calls</h3>
        <ul className="space-y-2">
          {run.calls.map((call) => (
            <li
              key={call.eventId}
              className="flex items-start gap-3 rounded-md border border-white/[0.08] px-3 py-2"
            >
              {call.outcome === "success" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" />
              ) : call.outcome === "error" ? (
                <XCircle className="mt-0.5 h-4 w-4 text-rose-300" />
              ) : (
                <Clock className="mt-0.5 h-4 w-4 text-amber-300" />
              )}
              <div className="min-w-0 flex-1">
                <p className="break-all font-mono text-xs">
                  {call.actionId ?? call.toolName ?? call.method}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {call.outcome} · {when(call.occurredAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {run.evidence.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Evidence</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {run.evidence.map((item) => (
              <li key={`${item.reference}-${item.recordedAt}`}>
                {item.summary} · {item.reference}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {run.handoff ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Handoff</h3>
          <p className="text-sm text-muted-foreground">
            To {run.handoff.toAgent}: {run.handoff.summary}
          </p>
        </section>
      ) : null}
    </article>
  );
}

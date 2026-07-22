"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pause, Play, RefreshCw } from "lucide-react";
import type {
  GoalDefinition,
  IntentDefinition,
  LoopDefinition,
  OperationDefinition,
  WorkflowDefinition,
} from "@kody-ade/agency-domain";
import { Button } from "@kody-ade/base/ui/button";
import { Badge } from "@kody-ade/base/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@kody-ade/base/ui/card";
import { EmptyState } from "@dashboard/lib/components/EmptyState";
import { selectionPath } from "@dashboard/lib/selection-routing";
import {
  useAgencyDefinitions,
  useAgencyStates,
  usePutAgencyState,
} from "@dashboard/lib/hooks/useAgencyModel";
import type {
  AgencyDefinitionRecord,
  AgencyStateRecord,
} from "@dashboard/lib/api/agency-model";

type PublicKind = "intent" | "operation" | "goal" | "loop";

const copy: Record<PublicKind, { title: string; singular: string; path: string }> = {
  intent: { title: "Intents", singular: "Intent", path: "/company-intents" },
  operation: { title: "Operations", singular: "Operation", path: "/operations" },
  goal: { title: "Goals", singular: "Goal", path: "/agent-goals" },
  loop: { title: "Loops", singular: "Loop", path: "/agent-loops" },
};

export function AgencyDefinitionsView({
  kind,
  selectedId,
}: {
  kind: PublicKind;
  selectedId?: string;
}) {
  const router = useRouter();
  const definitions = useAgencyDefinitions();
  const states = useAgencyStates();
  const records = useMemo(
    () => (definitions.data ?? []).filter((record) => record.kind === kind),
    [definitions.data, kind],
  );
  const selected = records.find((record) => record.data.id === selectedId) ?? null;
  const loading = definitions.isLoading || states.isLoading;
  const failed = definitions.error ?? states.error;

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  if (failed) {
    return (
      <EmptyState
        icon={<RefreshCw className="h-5 w-5" />}
        title={`Could not load ${copy[kind].title.toLowerCase()}`}
        hint={failed.message}
        action={<Button onClick={() => { void definitions.refetch(); void states.refetch(); }}>Retry</Button>}
      />
    );
  }

  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(18rem,24rem)_1fr]">
      <aside className="border-r border-border/70">
        <header className="border-b border-border/70 p-4">
          <h1 className="text-xl font-semibold">{copy[kind].title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {records.length} current immutable {records.length === 1 ? "definition" : "definitions"}
          </p>
        </header>
        {records.length === 0 ? (
          <EmptyState icon={null} title={`No ${copy[kind].title.toLowerCase()}`} hint="No V2 definitions exist for this repository." />
        ) : (
          <div className="divide-y divide-border/60">
            {records.map((record) => {
              const state = stateFor(states.data, record.data.id);
              return (
                <Button
                  key={record.recordId}
                  type="button"
                  variant="ghost"
                  className={`h-auto w-full justify-start rounded-none px-4 py-4 text-left whitespace-normal hover:bg-muted/40 ${selected?.recordId === record.recordId ? "bg-muted/60" : ""}`}
                  onClick={() => router.push(selectionPath(copy[kind].path, record.data.id))}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-mono text-sm font-medium">{record.data.id}</span>
                    {state ? <Badge variant="outline">{state.data.lifecycle}</Badge> : null}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{summary(record)}</p>
                </Button>
              );
            })}
          </div>
        )}
      </aside>
      <main className="min-w-0 p-4 md:p-8">
        {selected ? (
          <DefinitionDetail
            record={selected}
            definitions={definitions.data ?? []}
            state={stateFor(states.data, selected.data.id)}
          />
        ) : (
          <EmptyState icon={null} title={`Select a ${copy[kind].singular.toLowerCase()}`} hint="Choose a definition to inspect its ownership, execution, policy, and current state." />
        )}
      </main>
    </div>
  );
}

function DefinitionDetail({
  record,
  definitions,
  state,
}: {
  record: AgencyDefinitionRecord;
  definitions: AgencyDefinitionRecord[];
  state: AgencyStateRecord | null;
}) {
  const putState = usePutAgencyState();
  const operations = definitions.filter((item) => item.kind === "operation") as Array<AgencyDefinitionRecord & { data: OperationDefinition }>;
  const goals = definitions.filter((item) => item.kind === "goal") as Array<AgencyDefinitionRecord & { data: GoalDefinition }>;
  const loops = definitions.filter((item) => item.kind === "loop") as Array<AgencyDefinitionRecord & { data: LoopDefinition }>;
  const workflows = definitions.filter((item) => item.kind === "workflow") as Array<AgencyDefinitionRecord & { data: WorkflowDefinition }>;
  const data = record.data;
  const operationId = "operationId" in data ? data.operationId : null;
  const operation = operations.find((item) => item.data.id === operationId)?.data;
  const targetGoal =
    "targetRef" in data && data.targetRef.kind === "goal"
      ? goals.find((item) => item.data.id === data.targetRef.id)?.data
      : null;
  const workflowId =
    "executionRef" in data && data.executionRef.kind === "workflow"
      ? data.executionRef.id
      : "targetRef" in data && data.targetRef.kind === "workflow"
        ? data.targetRef.id
        : targetGoal?.executionRef.kind === "workflow"
          ? targetGoal.executionRef.id
        : null;
  const workflow = workflows.find((item) => item.data.id === workflowId)?.data;
  const ownedOperations =
    record.kind === "intent"
      ? operations.filter((item) => item.data.intentIds.includes(data.id))
      : [];
  const ownedWork =
    record.kind === "operation"
      ? [...goals, ...loops].filter((item) => item.data.operationId === data.id)
      : [];

  const setLifecycle = (lifecycle: "active" | "paused") => {
    if (!state || (state.kind !== "goal" && state.kind !== "loop")) return;
    putState.mutate({
      kind: state.kind,
      state: { ...state.data, lifecycle, updatedAt: new Date().toISOString() },
    });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant="outline" className="capitalize">{record.kind}</Badge>
          <h2 className="mt-2 break-all font-mono text-2xl font-semibold">{data.id}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Immutable revision {record.recordId.split(":").at(-1)?.slice(0, 12)}</p>
        </div>
        {state ? (
          <div className="flex gap-2">
            <Badge variant="secondary">{state.data.lifecycle}</Badge>
            {state.data.lifecycle === "active" ? (
              <Button size="sm" variant="outline" onClick={() => setLifecycle("paused")} disabled={putState.isPending}><Pause className="mr-2 h-4 w-4" />Pause</Button>
            ) : state.data.lifecycle === "paused" ? (
              <Button size="sm" variant="outline" onClick={() => setLifecycle("active")} disabled={putState.isPending}><Play className="mr-2 h-4 w-4" />Activate</Button>
            ) : null}
          </div>
        ) : null}
      </header>

      <Card><CardHeader><CardTitle>Purpose and ownership</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
        <Fact label="Summary" value={summary(record)} />
        {operation ? <Fact label="Operation" value={`${operation.name} (${operation.id})`} /> : null}
        {record.kind === "intent" ? <Fact label="Operations" value={ownedOperations.map((item) => item.data.id).join(", ") || "None"} /> : null}
        {record.kind === "operation" ? <Fact label="Goals and loops" value={ownedWork.map((item) => `${item.kind}:${item.data.id}`).join(", ") || "None"} /> : null}
      </CardContent></Card>

      {(record.kind === "goal" || record.kind === "loop") ? (
        <Card><CardHeader><CardTitle>Current state</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
          {state ? Object.entries(state.data).filter(([key]) => !["definitionId", "updatedAt"].includes(key)).map(([key, value]) => <Fact key={key} label={key} value={formatValue(value)} />) : <p className="text-sm text-muted-foreground">No runtime state.</p>}
        </CardContent></Card>
      ) : null}

      {(workflow || "executionRef" in data || "targetRef" in data) ? (
        <Card><CardHeader><CardTitle>Execution design</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
          {"executionRef" in data ? <Fact label="Target" value={`${data.executionRef.kind}:${data.executionRef.id}`} /> : null}
          {"targetRef" in data ? <Fact label="Target" value={`${data.targetRef.kind}:${data.targetRef.id}`} /> : null}
          {"trigger" in data ? <Fact label="Trigger" value={formatValue(data.trigger)} /> : null}
          {workflow ? <div><div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Workflow {workflow.id}</div><ol className="space-y-2">{workflow.steps.map((step) => <li key={step.id} className="rounded-md border p-3"><span className="font-mono">{step.id}</span><span className="mx-2 text-muted-foreground">→</span><span className="font-mono">{step.capabilityRef.id}</span>{step.dependsOn.length ? <div className="mt-1 text-xs text-muted-foreground">after {step.dependsOn.join(", ")}</div> : null}</li>)}</ol></div> : null}
        </CardContent></Card>
      ) : null}

      {record.kind === "intent" ? <PolicyCard intent={data as IntentDefinition} /> : null}
    </div>
  );
}

function PolicyCard({ intent }: { intent: IntentDefinition }) {
  return <Card><CardHeader><CardTitle>Inherited policy</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><Fact label="Approval" value={intent.policy.approval} /><Fact label="Concurrency" value={String(intent.policy.maxConcurrentRuns)} /><Fact label="Budget" value={formatValue(intent.policy.budget)} /><Fact label="Risky actions" value={intent.policy.riskyActions.join(", ") || "None"} /></CardContent></Card>;
}

function stateFor(states: AgencyStateRecord[] | undefined, id: string) {
  return states?.find((state) => state.definitionId === id) ?? null;
}

function summary(record: AgencyDefinitionRecord): string {
  const data = record.data;
  const id = data.id;
  if ("direction" in data) return data.direction;
  if ("responsibility" in data) return data.responsibility;
  if ("objective" in data) return data.objective.desiredState;
  if ("action" in data) return data.action;
  if ("role" in data) return data.role;
  if ("steps" in data) return `${data.steps.length} workflow steps`;
  return id;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-border/70 p-3"><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label.replace(/([A-Z])/g, " $1")}</div><div className="mt-1 break-words text-sm">{value}</div></div>;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.join(", ");
  return JSON.stringify(value);
}

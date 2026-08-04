/**
 * @fileType component
 * @domain triggers
 * @pattern triggers-manager
 * @ai-summary CRUD UI for trigger rules ("when event X matches, save mapped
 *   payload values or start Workflow Y"). Rules live at
 *   `triggers/config.json` in the backend; the event dropdown is the
 *   hardcoded system-event catalog, the entity dropdown is the brand's
 *   user-state namespaces. Follows the standard admin-page structure:
 *   PageShell + card rows with status icon and Power toggle + ui-kit
 *   dialog editor.
 */
"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CircleDot,
  Loader2,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Trash2,
  Zap,
} from "lucide-react";
import { SYSTEM_EVENT_NAMES } from "@kody-ade/base/events/catalog";
import { Button } from "@kody-ade/base/ui/button";
import { Card, CardContent } from "@kody-ade/base/ui/card";
import { Checkbox } from "@kody-ade/base/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@kody-ade/base/ui/dialog";
import { Input } from "@kody-ade/base/ui/input";
import { Label } from "@kody-ade/base/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@kody-ade/base/ui/select";
import { slugifyTitle } from "@kody-ade/base/slug";
import { buildAuthHeaders, useAuth } from "../auth-context";
import { ConfirmDialog } from "./ConfirmDialog";
import { EmptyState } from "./EmptyState";
import { PageShell } from "./PageShell";

const GITHUB_WORKFLOW_COMPLETED_EVENT = "github.workflow_run.completed";
const WORKFLOW_CONCLUSIONS = [
  "success",
  "failure",
  "neutral",
  "cancelled",
  "skipped",
  "timed_out",
  "action_required",
  "stale",
] as const;
type WorkflowConclusion = (typeof WORKFLOW_CONCLUSIONS)[number];

interface GitHubWorkflowOption {
  id: number;
  name: string;
  path: string;
  state: string;
}

interface KodyWorkflowOption {
  id: string;
  workflow: { name: string };
  runnable?: boolean;
}

interface TriggerRow {
  id: string;
  name: string;
  enabled: boolean;
  event: string;
  conditions: Array<{ path: string; op: string; value?: unknown }>;
  action:
    | {
        type: "save-user-state";
        namespace: string;
        map: Record<string, string>;
      }
    | {
        type: "start-workflow";
        workflowId: string;
        inputMap: Record<string, string>;
      };
}

interface NamespaceRow {
  name: string;
  origin: "core" | "brand";
  modelWritable: boolean;
}

const triggersQueryKey = (owner: string | null, repo: string | null) =>
  ["kody-triggers", owner, repo] as const;
const namespacesQueryKey = (owner: string | null, repo: string | null) =>
  ["kody-user-state-namespaces", owner, repo] as const;

async function fetchJson<T>(
  url: string,
  headers: Record<string, string>,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    message?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(
      json.detail || json.message || json.error || `HTTP ${res.status}`,
    );
  }
  return json;
}

interface EditorState {
  id: string;
  name: string;
  enabled: boolean;
  event: string;
  actionType: "save-user-state" | "start-workflow";
  namespace: string;
  workflowId: string;
  githubWorkflowId: number | null;
  githubWorkflowName: string;
  githubWorkflowConclusion: WorkflowConclusion | "";
  conditions: Array<{ path: string; op: string; value: string }>;
  map: Array<{ key: string; source: string }>;
  isNew: boolean;
}

function conditionRows(
  conditions: TriggerRow["conditions"],
): EditorState["conditions"] {
  return conditions.map((condition) => ({
    path: condition.path,
    op: condition.op,
    value: condition.value == null ? "" : String(condition.value),
  }));
}

function mapRows(map: Record<string, string>): EditorState["map"] {
  return Object.entries(map).map(([key, source]) => ({ key, source }));
}

function editorFromTrigger(trigger: TriggerRow): EditorState {
  const action = trigger.action;
  const isWorkflow = action.type === "start-workflow";
  const githubWorkflowIdCondition = trigger.conditions.find(
    (condition) => condition.path === "workflowId" && condition.op === "equals",
  );
  const githubWorkflowNameCondition = trigger.conditions.find(
    (condition) =>
      condition.path === "workflowName" && condition.op === "equals",
  );
  const githubWorkflowId =
    typeof githubWorkflowIdCondition?.value === "number" &&
    Number.isSafeInteger(githubWorkflowIdCondition.value)
      ? githubWorkflowIdCondition.value
      : typeof githubWorkflowIdCondition?.value === "string" &&
          /^\d+$/.test(githubWorkflowIdCondition.value)
        ? Number(githubWorkflowIdCondition.value)
        : null;
  const githubWorkflowName =
    typeof githubWorkflowNameCondition?.value === "string"
      ? githubWorkflowNameCondition.value
      : "";
  const githubWorkflowConclusionCondition = trigger.conditions.find(
    (condition) => condition.path === "conclusion" && condition.op === "equals",
  );
  const githubWorkflowConclusion = WORKFLOW_CONCLUSIONS.includes(
    githubWorkflowConclusionCondition?.value as WorkflowConclusion,
  )
    ? (githubWorkflowConclusionCondition?.value as WorkflowConclusion)
    : "";
  return {
    id: trigger.id,
    name: trigger.name,
    enabled: trigger.enabled,
    event: trigger.event,
    actionType: trigger.action.type,
    namespace: action.type === "save-user-state" ? action.namespace : "",
    workflowId: isWorkflow ? action.workflowId : "",
    githubWorkflowId,
    githubWorkflowName,
    githubWorkflowConclusion,
    conditions: conditionRows(
      trigger.conditions.filter(
        (condition) =>
          !["workflowId", "workflowName", "conclusion"].includes(
            condition.path,
          ),
      ),
    ),
    map: mapRows(
      action.type === "start-workflow" ? action.inputMap : action.map,
    ),
    isNew: false,
  };
}

function emptyEditor(defaultNamespace: string): EditorState {
  return {
    id: "",
    name: "",
    enabled: true,
    event: SYSTEM_EVENT_NAMES[0],
    actionType: "save-user-state",
    namespace: defaultNamespace,
    workflowId: "",
    githubWorkflowId: null,
    githubWorkflowName: "",
    githubWorkflowConclusion: "",
    conditions: [],
    map: [],
    isNew: true,
  };
}

export function TriggersManager() {
  const { auth } = useAuth();
  const headers = useMemo(
    () => ({ "content-type": "application/json", ...buildAuthHeaders(auth) }),
    [auth],
  );
  const owner = auth?.owner ?? null;
  const repo = auth?.repo ?? null;
  const queryClient = useQueryClient();

  const triggersQuery = useQuery({
    queryKey: triggersQueryKey(owner, repo),
    enabled: !!auth,
    queryFn: () =>
      fetchJson<{ triggers: TriggerRow[] }>("/api/kody/triggers", headers).then(
        (json) => json.triggers ?? [],
      ),
  });
  const namespacesQuery = useQuery({
    queryKey: namespacesQueryKey(owner, repo),
    enabled: !!auth,
    queryFn: () =>
      fetchJson<{ namespaces: NamespaceRow[] }>(
        "/api/kody/user-state",
        headers,
      ).then((json) => json.namespaces ?? []),
  });

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TriggerRow | null>(null);

  const githubWorkflowsQuery = useQuery({
    queryKey: ["kody-github-workflows", owner, repo] as const,
    enabled:
      !!auth && !!editor && editor.event === GITHUB_WORKFLOW_COMPLETED_EVENT,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: () =>
      fetchJson<{ workflows: GitHubWorkflowOption[] }>(
        "/api/kody/github/workflows",
        headers,
      ).then((json) => json.workflows ?? []),
  });
  const workflowDefinitionsQuery = useQuery({
    queryKey: ["kody-workflow-definitions", owner, repo] as const,
    enabled: !!auth && !!editor && editor.actionType === "start-workflow",
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: () =>
      fetchJson<{ workflows: KodyWorkflowOption[] }>(
        "/api/kody/company/workflows",
        headers,
      ).then((json) => json.workflows ?? []),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: triggersQueryKey(owner, repo) });

  const saveMutation = useMutation({
    mutationFn: async (state: EditorState) => {
      const advancedConditions = state.conditions
        .filter((condition) => condition.path.trim())
        .map((condition) => ({
          path: condition.path.trim(),
          op: condition.op,
          ...(condition.value.trim() ? { value: condition.value } : {}),
        }));
      const workflowConditions =
        state.event === GITHUB_WORKFLOW_COMPLETED_EVENT
          ? [
              ...(state.githubWorkflowId !== null
                ? [
                    {
                      path: "workflowId",
                      op: "equals",
                      value: state.githubWorkflowId,
                    },
                  ]
                : state.githubWorkflowName
                  ? [
                      {
                        path: "workflowName",
                        op: "equals",
                        value: state.githubWorkflowName,
                      },
                    ]
                  : []),
              ...(state.githubWorkflowConclusion
                ? [
                    {
                      path: "conclusion",
                      op: "equals",
                      value: state.githubWorkflowConclusion,
                    },
                  ]
                : []),
            ]
          : [];
      const conditions = [...workflowConditions, ...advancedConditions];
      const map = Object.fromEntries(
        state.map
          .filter((entry) => entry.key.trim() && entry.source.trim())
          .map((entry) => [entry.key.trim(), entry.source.trim()]),
      );
      await fetchJson("/api/kody/triggers", headers, {
        method: "POST",
        body: JSON.stringify({
          trigger: {
            id: state.isNew ? slugifyTitle(state.name) : state.id,
            name: state.name.trim(),
            enabled: state.enabled,
            event: state.event,
            conditions,
            action:
              state.actionType === "start-workflow"
                ? {
                    type: "start-workflow",
                    workflowId: state.workflowId.trim(),
                    inputMap: map,
                  }
                : {
                    type: "save-user-state",
                    namespace: state.namespace,
                    map,
                  },
          },
        }),
      });
    },
    onSuccess: () => {
      toast.success("Trigger saved");
      setEditor(null);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleMutation = useMutation({
    mutationFn: (trigger: TriggerRow) =>
      fetchJson("/api/kody/triggers", headers, {
        method: "POST",
        body: JSON.stringify({
          trigger: { ...trigger, enabled: !trigger.enabled },
        }),
      }),
    onSuccess: () => void invalidate(),
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/kody/triggers/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers,
      }).then((res) => {
        if (!res.ok && res.status !== 204) {
          throw new Error(`HTTP ${res.status}`);
        }
      }),
    onSuccess: () => {
      toast.success("Trigger deleted");
      setDeleteTarget(null);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const namespaces = namespacesQuery.data ?? [];
  const triggers = triggersQuery.data ?? [];
  const githubWorkflows = githubWorkflowsQuery.data ?? [];
  const kodyWorkflows = (workflowDefinitionsQuery.data ?? []).filter(
    (workflow) => workflow.runnable !== false,
  );
  const selectedGithubWorkflowValue = editor
    ? editor.githubWorkflowId !== null
      ? String(editor.githubWorkflowId)
      : editor.githubWorkflowName
        ? `name:${editor.githubWorkflowName}`
        : ""
    : "";

  return (
    <PageShell
      title="Triggers"
      icon={Zap}
      subtitle="Rules that react to system events and save data or start workflows."
      actions={
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void invalidate()}
            disabled={triggersQuery.isFetching}
          >
            <RefreshCw
              className={`h-4 w-4 ${triggersQuery.isFetching ? "animate-spin" : ""}`}
            />
          </Button>
          <Button
            size="sm"
            onClick={() => setEditor(emptyEditor(namespaces[0]?.name ?? ""))}
            disabled={!auth}
          >
            <Plus className="mr-1.5 h-4 w-4" /> New trigger
          </Button>
        </>
      }
    >
      {triggersQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : triggers.length === 0 ? (
        <EmptyState
          icon={<Zap />}
          title="No triggers yet"
          hint="Create a rule like: when a GitHub workflow finishes, start a Kody workflow."
        />
      ) : (
        <div className="space-y-2">
          {triggers.map((trigger) => (
            <Card key={trigger.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  {trigger.enabled ? (
                    <CircleDot className="h-4 w-4 shrink-0 text-emerald-400" />
                  ) : (
                    <PowerOff className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium">{trigger.name}</div>
                    <div className="truncate text-sm text-muted-foreground">
                      <code>{trigger.event}</code> →{" "}
                      <code>
                        {trigger.action.type === "start-workflow"
                          ? trigger.action.workflowId
                          : trigger.action.namespace}
                      </code>
                      {trigger.conditions.length > 0
                        ? ` · ${trigger.conditions.length} condition(s)`
                        : ""}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    title={trigger.enabled ? "Disable" : "Enable"}
                    disabled={toggleMutation.isPending}
                    onClick={() => toggleMutation.mutate(trigger)}
                  >
                    <Power
                      className={`h-4 w-4 ${
                        trigger.enabled
                          ? "text-emerald-400"
                          : "text-muted-foreground"
                      }`}
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditor(editorFromTrigger(trigger))}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(trigger)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editor} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editor?.isNew ? "New trigger" : "Edit trigger"}
            </DialogTitle>
            <DialogDescription>
              When the event matches, Kody performs the selected action.
            </DialogDescription>
          </DialogHeader>
          {editor ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="trigger-name">Name</Label>
                <Input
                  id="trigger-name"
                  value={editor.name}
                  placeholder="Save quiz answers"
                  onChange={(e) =>
                    setEditor({ ...editor, name: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Event</Label>
                  <Select
                    value={editor.event}
                    onValueChange={(value) =>
                      setEditor({ ...editor, event: value })
                    }
                  >
                    <SelectTrigger aria-label="Event">
                      <SelectValue placeholder="Event" />
                    </SelectTrigger>
                    <SelectContent>
                      {SYSTEM_EVENT_NAMES.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Action</Label>
                  <Select
                    value={editor.actionType}
                    onValueChange={(value: EditorState["actionType"]) =>
                      setEditor({
                        ...editor,
                        actionType: value,
                        ...(value === "save-user-state"
                          ? { workflowId: "" }
                          : { namespace: "" }),
                      })
                    }
                  >
                    <SelectTrigger aria-label="Action">
                      <SelectValue placeholder="Action" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="save-user-state">
                        Save state
                      </SelectItem>
                      <SelectItem value="start-workflow">
                        Start Workflow
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {editor.actionType === "save-user-state" ? (
                <div className="space-y-1">
                  <Label>Entity</Label>
                  <Select
                    value={editor.namespace}
                    onValueChange={(value) =>
                      setEditor({ ...editor, namespace: value })
                    }
                  >
                    <SelectTrigger aria-label="Entity">
                      <SelectValue placeholder="Entity" />
                    </SelectTrigger>
                    <SelectContent>
                      {namespaces.map((ns) => (
                        <SelectItem key={ns.name} value={ns.name}>
                          {ns.name} ({ns.origin})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1">
                  <Label>Start Kody workflow</Label>
                  <Select
                    value={editor.workflowId}
                    onValueChange={(value) =>
                      setEditor({ ...editor, workflowId: value })
                    }
                    disabled={workflowDefinitionsQuery.isLoading}
                  >
                    <SelectTrigger aria-label="Start Kody workflow">
                      <SelectValue
                        placeholder={
                          workflowDefinitionsQuery.isLoading
                            ? "Loading workflows…"
                            : "Select a workflow"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {kodyWorkflows.map((workflow) => (
                        <SelectItem key={workflow.id} value={workflow.id}>
                          {workflow.workflow.name} ({workflow.id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {editor.event === GITHUB_WORKFLOW_COMPLETED_EVENT ? (
                <div className="space-y-3 rounded-md border border-border/70 p-3">
                  <div className="space-y-1">
                    <Label>When GitHub workflow finishes</Label>
                    <Select
                      value={selectedGithubWorkflowValue}
                      onValueChange={(value) => {
                        const workflow = githubWorkflows.find(
                          (candidate) => String(candidate.id) === value,
                        );
                        if (!workflow) return;
                        setEditor({
                          ...editor,
                          githubWorkflowId: workflow.id,
                          githubWorkflowName: workflow.name,
                        });
                      }}
                      disabled={githubWorkflowsQuery.isLoading}
                    >
                      <SelectTrigger aria-label="When GitHub workflow finishes">
                        <SelectValue
                          placeholder={
                            githubWorkflowsQuery.isLoading
                              ? "Loading GitHub workflows…"
                              : "Select a GitHub workflow"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {editor.githubWorkflowName &&
                        editor.githubWorkflowId === null &&
                        !githubWorkflows.some(
                          (workflow) =>
                            workflow.name === editor.githubWorkflowName,
                        ) ? (
                          <SelectItem
                            value={`name:${editor.githubWorkflowName}`}
                          >
                            {editor.githubWorkflowName}
                          </SelectItem>
                        ) : null}
                        {githubWorkflows.map((workflow) => (
                          <SelectItem
                            key={workflow.id}
                            value={String(workflow.id)}
                          >
                            {workflow.name}
                            {workflow.state === "active"
                              ? ""
                              : ` (${workflow.state.replaceAll("_", " ")})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Only when result is</Label>
                    <Select
                      value={editor.githubWorkflowConclusion || "any"}
                      onValueChange={(value) =>
                        setEditor({
                          ...editor,
                          githubWorkflowConclusion:
                            value === "any"
                              ? ""
                              : (value as WorkflowConclusion),
                        })
                      }
                    >
                      <SelectTrigger aria-label="Only when result is">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any result</SelectItem>
                        {WORKFLOW_CONCLUSIONS.map((conclusion) => (
                          <SelectItem key={conclusion} value={conclusion}>
                            {conclusion.replaceAll("_", " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {editor.actionType === "start-workflow"
                  ? "By default the whole normalized event is passed as Workflow input."
                  : "By default the whole event payload is saved to the entity."}
              </p>
              <details className="rounded-md border border-border px-3 py-2">
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  More filters and input mapping (optional)
                </summary>
                <div className="mt-3 space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Additional filters</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setEditor({
                            ...editor,
                            conditions: [
                              ...editor.conditions,
                              { path: "", op: "equals", value: "" },
                            ],
                          })
                        }
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" /> Add condition
                      </Button>
                    </div>
                    {editor.conditions.map((condition, index) => (
                      <div
                        key={`condition-${index}`}
                        className="grid grid-cols-[1fr_8rem_1fr_auto] gap-2"
                      >
                        <Input
                          aria-label="Condition payload path"
                          placeholder="conclusion"
                          value={condition.path}
                          onChange={(e) => {
                            const conditions = [...editor.conditions];
                            conditions[index] = {
                              ...condition,
                              path: e.target.value,
                            };
                            setEditor({ ...editor, conditions });
                          }}
                        />
                        <Select
                          value={condition.op}
                          onValueChange={(op) => {
                            const conditions = [...editor.conditions];
                            conditions[index] = { ...condition, op };
                            setEditor({ ...editor, conditions });
                          }}
                        >
                          <SelectTrigger aria-label="Condition operator">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="equals">equals</SelectItem>
                            <SelectItem value="not_equals">
                              not equals
                            </SelectItem>
                            <SelectItem value="contains">contains</SelectItem>
                            <SelectItem value="exists">exists</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          aria-label="Condition value"
                          placeholder="failure"
                          disabled={condition.op === "exists"}
                          value={condition.value}
                          onChange={(e) => {
                            const conditions = [...editor.conditions];
                            conditions[index] = {
                              ...condition,
                              value: e.target.value,
                            };
                            setEditor({ ...editor, conditions });
                          }}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove condition"
                          onClick={() =>
                            setEditor({
                              ...editor,
                              conditions: editor.conditions.filter(
                                (_, i) => i !== index,
                              ),
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Pass these values</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setEditor({
                            ...editor,
                            map: [...editor.map, { key: "", source: "" }],
                          })
                        }
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" /> Add mapping
                      </Button>
                    </div>
                    {editor.map.map((entry, index) => (
                      <div
                        key={`map-${index}`}
                        className="grid grid-cols-[1fr_1fr_auto] gap-2"
                      >
                        <Input
                          aria-label="Workflow input key"
                          placeholder="sourceRunId"
                          value={entry.key}
                          onChange={(e) => {
                            const map = [...editor.map];
                            map[index] = { ...entry, key: e.target.value };
                            setEditor({ ...editor, map });
                          }}
                        />
                        <Input
                          aria-label="Workflow input source"
                          placeholder="payload.runId"
                          value={entry.source}
                          onChange={(e) => {
                            const map = [...editor.map];
                            map[index] = { ...entry, source: e.target.value };
                            setEditor({ ...editor, map });
                          }}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove mapping"
                          onClick={() =>
                            setEditor({
                              ...editor,
                              map: editor.map.filter((_, i) => i !== index),
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={editor.enabled}
                      onCheckedChange={(checked) =>
                        setEditor({ ...editor, enabled: checked === true })
                      }
                    />
                    Enabled
                  </label>
                </div>
              </details>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditor(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => saveMutation.mutate(editor)}
                  disabled={
                    saveMutation.isPending ||
                    !editor.name.trim() ||
                    (editor.actionType === "save-user-state"
                      ? !editor.namespace
                      : !editor.workflowId.trim())
                  }
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : null}
                  Save
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete trigger?"
        description={`"${deleteTarget?.name}" will stop reacting to events.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </PageShell>
  );
}

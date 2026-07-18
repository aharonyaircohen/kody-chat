/**
 * @fileType component
 * @domain triggers
 * @pattern triggers-manager
 * @ai-summary CRUD UI for trigger rules ("when event X matches, save mapped
 *   payload values to user-state entity Y"). Rules live at
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
import { Textarea } from "@kody-ade/base/ui/textarea";
import { slugifyTitle } from "@kody-ade/base/slug";
import { buildAuthHeaders, useAuth } from "@dashboard/lib/auth-context";
import { ConfirmDialog } from "./ConfirmDialog";
import { EmptyState } from "./EmptyState";
import { PageShell } from "./PageShell";

interface TriggerRow {
  id: string;
  name: string;
  enabled: boolean;
  event: string;
  conditions: Array<{ path: string; op: string; value?: unknown }>;
  action: {
    type: "save-user-state";
    namespace: string;
    map: Record<string, string>;
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
  namespace: string;
  conditionsJson: string;
  mapJson: string;
  isNew: boolean;
}

function editorFromTrigger(trigger: TriggerRow): EditorState {
  return {
    id: trigger.id,
    name: trigger.name,
    enabled: trigger.enabled,
    event: trigger.event,
    namespace: trigger.action.namespace,
    conditionsJson: JSON.stringify(trigger.conditions, null, 2),
    mapJson: JSON.stringify(trigger.action.map, null, 2),
    isNew: false,
  };
}

function emptyEditor(defaultNamespace: string): EditorState {
  return {
    id: "",
    name: "",
    enabled: true,
    event: SYSTEM_EVENT_NAMES[0],
    namespace: defaultNamespace,
    conditionsJson: "[]",
    mapJson: "{}",
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

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: triggersQueryKey(owner, repo) });

  const saveMutation = useMutation({
    mutationFn: async (state: EditorState) => {
      let conditions: unknown;
      let map: unknown;
      try {
        conditions = JSON.parse(state.conditionsJson);
        map = JSON.parse(state.mapJson);
      } catch {
        throw new Error("Conditions and map must be valid JSON");
      }
      await fetchJson("/api/kody/triggers", headers, {
        method: "POST",
        body: JSON.stringify({
          trigger: {
            id: state.isNew ? slugifyTitle(state.name) : state.id,
            name: state.name.trim(),
            enabled: state.enabled,
            event: state.event,
            conditions,
            action: {
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

  return (
    <PageShell
      title="Triggers"
      icon={Zap}
      subtitle="Rules that react to system events and save data to user-state entities."
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
          hint="Create a rule like: when a form is submitted, save the answers to an entity."
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
                      <code>{trigger.action.namespace}</code>
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
              When the event matches, mapped values are saved to the entity.
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
                    <SelectTrigger>
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
                  <Label>Entity</Label>
                  <Select
                    value={editor.namespace}
                    onValueChange={(value) =>
                      setEditor({ ...editor, namespace: value })
                    }
                  >
                    <SelectTrigger>
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
              </div>
              <p className="text-xs text-muted-foreground">
                By default the whole event payload is saved to the entity.
              </p>
              <details className="rounded-md border border-border px-3 py-2">
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  Advanced (conditions and data mapping)
                </summary>
                <div className="mt-3 space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="trigger-conditions">
                      Conditions (JSON)
                    </Label>
                    <Textarea
                      id="trigger-conditions"
                      rows={3}
                      value={editor.conditionsJson}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          conditionsJson: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="trigger-map">
                      Data map (JSON: entity key → payload.path / literal:value;
                      empty = save whole payload)
                    </Label>
                    <Textarea
                      id="trigger-map"
                      rows={4}
                      value={editor.mapJson}
                      onChange={(e) =>
                        setEditor({ ...editor, mapJson: e.target.value })
                      }
                    />
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
                    !editor.namespace
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

/**
 * @fileType component
 * @domain guides
 * @pattern guides-manager
 * @ai-summary CRUD UI for guides — ordered teaching steps that guide the
 *   chat model. Follows the standard admin-page structure (PageShell + card
 *   rows + Power toggle + ui-kit dialog editor) and reuses the shared
 *   SortableList for drag-to-reorder steps.
 */
"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CircleDot,
  Route,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@kody-ade/base/ui/button";
import { Card, CardContent } from "@kody-ade/base/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@kody-ade/base/ui/dialog";
import { Input } from "@kody-ade/base/ui/input";
import { Label } from "@kody-ade/base/ui/label";
import { Textarea } from "@kody-ade/base/ui/textarea";
import { SortableList } from "@kody-ade/base/ui/sortable-list";
import { slugifyTitle } from "@kody-ade/base/slug";
import { buildAuthHeaders, useAuth } from "@dashboard/lib/auth-context";
import { ConfirmDialog } from "./ConfirmDialog";
import { EmptyState } from "./EmptyState";
import { PageShell } from "./PageShell";

interface GuideStep {
  id: string;
  title: string;
  instruction: string;
  advance: "model" | "keyword";
  keyword?: string;
}

interface GuideRow {
  slug: string;
  title: string;
  description: string;
  enabled: boolean;
  steps: GuideStep[];
}

async function fetchJson<T>(
  url: string,
  headers: Record<string, string>,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(json.detail || json.error || `HTTP ${res.status}`);
  }
  return json;
}

interface EditorState extends GuideRow {
  isNew: boolean;
}

let stepCounter = 0;
function newStep(): GuideStep {
  stepCounter += 1;
  return {
    id: `step-${Date.now().toString(36)}-${stepCounter}`,
    title: "",
    instruction: "",
    advance: "model",
  };
}

export function GuidesManager() {
  const { auth } = useAuth();
  const headers = useMemo(
    () => ({ "content-type": "application/json", ...buildAuthHeaders(auth) }),
    [auth],
  );
  const queryClient = useQueryClient();
  const queryKey = ["kody-guides", auth?.owner, auth?.repo] as const;

  const guidesQuery = useQuery({
    queryKey,
    enabled: !!auth,
    queryFn: () =>
      fetchJson<{ guides: GuideRow[] }>("/api/kody/guides", headers).then(
        (json) => json.guides ?? [],
      ),
  });

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GuideRow | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const saveMutation = useMutation({
    mutationFn: (state: EditorState) =>
      fetchJson("/api/kody/guides", headers, {
        method: "POST",
        body: JSON.stringify({
          guide: {
            slug: state.isNew ? slugifyTitle(state.title) : state.slug,
            title: state.title.trim(),
            description: state.description.trim(),
            enabled: state.enabled,
            steps: state.steps.map((step) => ({
              id: step.id,
              title: step.title.trim(),
              instruction: step.instruction.trim(),
              advance: step.advance,
              ...(step.advance === "keyword" && step.keyword
                ? { keyword: step.keyword.trim() }
                : {}),
            })),
          },
        }),
      }),
    onSuccess: () => {
      toast.success("Guide saved");
      setEditor(null);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleMutation = useMutation({
    mutationFn: (guide: GuideRow) =>
      fetchJson("/api/kody/guides", headers, {
        method: "POST",
        body: JSON.stringify({
          guide: { ...guide, enabled: !guide.enabled },
        }),
      }),
    onSuccess: () => void invalidate(),
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (slug: string) =>
      fetch(`/api/kody/guides/${encodeURIComponent(slug)}`, {
        method: "DELETE",
        headers,
      }).then((res) => {
        if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      }),
    onSuccess: () => {
      toast.success("Guide deleted");
      setDeleteTarget(null);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const guides = guidesQuery.data ?? [];

  const updateStep = (id: string, patch: Partial<GuideStep>) =>
    setEditor((current) =>
      current
        ? {
            ...current,
            steps: current.steps.map((step) =>
              step.id === id ? { ...step, ...patch } : step,
            ),
          }
        : current,
    );

  return (
    <PageShell
      title="Guides"
      icon={Route}
      subtitle="Ordered steps that guide the chat, one step at a time."
      actions={
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void invalidate()}
            disabled={guidesQuery.isFetching}
          >
            <RefreshCw
              className={`h-4 w-4 ${guidesQuery.isFetching ? "animate-spin" : ""}`}
            />
          </Button>
          <Button
            size="sm"
            disabled={!auth}
            onClick={() =>
              setEditor({
                slug: "",
                title: "",
                description: "",
                enabled: true,
                steps: [newStep()],
                isNew: true,
              })
            }
          >
            <Plus className="mr-1.5 h-4 w-4" /> New guide
          </Button>
        </>
      }
    >
      {guidesQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : guides.length === 0 ? (
        <EmptyState
          icon={<Route />}
          title="No guides yet"
          hint="Build an ordered set of steps; the chat follows them one at a time."
        />
      ) : (
        <div className="space-y-2">
          {guides.map((guide) => (
            <Card key={guide.slug}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  {guide.enabled ? (
                    <CircleDot className="h-4 w-4 shrink-0 text-emerald-400" />
                  ) : (
                    <PowerOff className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium">{guide.title}</div>
                    <div className="truncate text-sm text-muted-foreground">
                      {guide.steps.length} steps
                      {guide.description ? ` · ${guide.description}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    title={guide.enabled ? "Disable" : "Enable"}
                    disabled={toggleMutation.isPending}
                    onClick={() => toggleMutation.mutate(guide)}
                  >
                    <Power
                      className={`h-4 w-4 ${
                        guide.enabled
                          ? "text-emerald-400"
                          : "text-muted-foreground"
                      }`}
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditor({ ...guide, isNew: false })}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(guide)}
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
        <DialogContent modalSize="wide" modalHeight="viewport">
          <DialogHeader>
            <DialogTitle>
              {editor?.isNew ? "New guide" : "Edit guide"}
            </DialogTitle>
            <DialogDescription>
              Drag to reorder steps; the model teaches them in order.
            </DialogDescription>
          </DialogHeader>
          {editor ? (
            <div className="space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="guide-title">Title</Label>
                  <Input
                    id="guide-title"
                    value={editor.title}
                    placeholder="Intro to fractions"
                    onChange={(e) =>
                      setEditor({ ...editor, title: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="guide-desc">Description</Label>
                  <Input
                    id="guide-desc"
                    value={editor.description}
                    onChange={(e) =>
                      setEditor({ ...editor, description: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label>Steps</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setEditor({
                      ...editor,
                      steps: [...editor.steps, newStep()],
                    })
                  }
                >
                  <Plus className="mr-1 h-4 w-4" /> Add step
                </Button>
              </div>

              <SortableList
                items={editor.steps}
                getId={(step) => step.id}
                onReorder={(steps) => setEditor({ ...editor, steps })}
                renderItem={(step, handle) => (
                  <div className="rounded-md border border-border p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <button
                        type="button"
                        className="cursor-grab touch-none text-muted-foreground"
                        {...handle.attributes}
                        {...handle.listeners}
                        aria-label="Drag step"
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
                      <Input
                        value={step.title}
                        placeholder="Step title"
                        onChange={(e) =>
                          updateStep(step.id, { title: e.target.value })
                        }
                      />
                      {editor.steps.length > 1 ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setEditor({
                              ...editor,
                              steps: editor.steps.filter(
                                (s) => s.id !== step.id,
                              ),
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      ) : null}
                    </div>
                    <Textarea
                      rows={2}
                      value={step.instruction}
                      placeholder="What the model should teach / ask on this step"
                      onChange={(e) =>
                        updateStep(step.id, { instruction: e.target.value })
                      }
                    />
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          checked={step.advance === "model"}
                          onChange={() =>
                            updateStep(step.id, { advance: "model" })
                          }
                        />
                        model decides
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          checked={step.advance === "keyword"}
                          onChange={() =>
                            updateStep(step.id, { advance: "keyword" })
                          }
                        />
                        keyword
                      </label>
                      {step.advance === "keyword" ? (
                        <Input
                          className="h-8 w-40"
                          value={step.keyword ?? ""}
                          placeholder="answer must contain…"
                          onChange={(e) =>
                            updateStep(step.id, { keyword: e.target.value })
                          }
                        />
                      ) : null}
                    </div>
                  </div>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditor(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => saveMutation.mutate(editor)}
                  disabled={
                    saveMutation.isPending ||
                    !editor.title.trim() ||
                    editor.steps.some(
                      (step) => !step.title.trim() || !step.instruction.trim(),
                    )
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
        title="Delete guide?"
        description={`"${deleteTarget?.title}" will be removed.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.slug)}
      />
    </PageShell>
  );
}

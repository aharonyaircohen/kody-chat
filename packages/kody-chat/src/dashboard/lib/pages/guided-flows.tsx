/** @fileType page */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, Loader2, Pencil, Plus, Route, Trash2 } from "lucide-react";
import { repoScopedHref } from "@kody-ade/base/routes";
import { AuthGuard } from "../auth-guard";
import { buildAuthHeaders, useAuth } from "@dashboard/lib/auth-context";
import {
  listAuthoringRendererSlugs,
  type GuidedFlowDraft,
  type GuidedFlowDraftStep,
} from "../guided-flows/authoring";
import { Button } from "@kody-ade/base/ui/button";
import { Card, CardContent } from "@kody-ade/base/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@kody-ade/base/ui/dialog";
import { PageShell } from "../components/PageShell";
import { ConfirmDialog } from "../components/ConfirmDialog";

interface FlowDefinition {
  id: string;
  title: string;
  description?: string;
  version?: number;
  completionRouteId?: string;
  steps: Array<{
    id?: string;
    title?: string;
    explanation?: string;
    rendererSlug: string;
    rendererData?: Record<string, unknown>;
  }>;
}

const BUILTIN_START_OPTIONS: FlowDefinition[] = [
  {
    id: "create-workflow",
    title: "Create a workflow",
    description: "Build a workflow from an existing capability.",
    steps: [{ rendererSlug: "guided-form" }],
  },
];

function isBuiltinDefinition(definition: FlowDefinition): boolean {
  return BUILTIN_START_OPTIONS.some(
    (candidate) => candidate.id === definition.id,
  );
}

const RENDERER_LABELS: Record<string, string> = {
  "approval-card": "Approval card",
  "guided-form": "Guided form",
  "selection-list": "Selection list",
  "multi-select-list": "Multi-select list",
};

function newDraftStep(): GuidedFlowDraftStep {
  return {
    title: "New step",
    explanation: "Explain what the user should do next.",
    rendererSlug: "guided-form",
  };
}

function draftFromDefinition(definition: FlowDefinition): GuidedFlowDraft {
  return {
    title: definition.title,
    completionRouteId: definition.completionRouteId ?? "",
    steps: definition.steps.map((step) => ({
      title: step.title ?? definition.title,
      explanation:
        step.explanation ??
        (typeof step.rendererData?.body === "string"
          ? step.rendererData.body
          : "Explain what the user should do next."),
      rendererSlug: step.rendererSlug,
    })),
  };
}

function FlowBuilder({
  mode,
  definition,
  onSaved,
  onClose,
}: {
  mode: "create" | "edit" | "view";
  definition?: FlowDefinition;
  onSaved: (definition: FlowDefinition) => void;
  onClose: () => void;
}) {
  const { auth } = useAuth();
  const [draft, setDraft] = useState<GuidedFlowDraft>({
    ...(definition
      ? draftFromDefinition(definition)
      : { title: "", completionRouteId: "", steps: [newDraftStep()] }),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readOnly = mode === "view";

  function updateStep(index: number, update: Partial<GuidedFlowDraftStep>) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) =>
        stepIndex === index ? { ...step, ...update } : step,
      ),
    }));
  }

  async function save() {
    if (!auth) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/kody/guided-flows", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildAuthHeaders(auth),
        },
        body: JSON.stringify({
          action: mode === "edit" ? "update-definition" : "create-definition",
          ...(mode === "edit" && definition ? { flowId: definition.id } : {}),
          draft,
        }),
      });
      const payload = (await response.json()) as {
        definition?: FlowDefinition;
        error?: string;
      };
      if (!response.ok || !payload.definition) {
        throw new Error(payload.error ?? "Unable to save Guided Flow");
      }
      onSaved(payload.definition);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save Guided Flow",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent modalSize="wide" className="items-start">
        <DialogHeader>
          <DialogTitle>
            {mode === "create"
              ? "Create a Guided Flow"
              : mode === "edit"
                ? "Edit Guided Flow"
                : "View Guided Flow"}
          </DialogTitle>
          <DialogDescription>
            Define the steps and renderer Kody should show.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="mt-4 text-sm text-red-200">
            {error}
          </p>
        ) : null}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-white/70">
            Flow name
            <input
              aria-label="Flow name"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-white"
              value={draft.title}
              disabled={readOnly}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
          </label>
          <label className="text-sm text-white/70">
            Completion page (optional)
            <input
              aria-label="Completion page"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-white"
              placeholder="workflows"
              value={draft.completionRouteId}
              disabled={readOnly}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  completionRouteId: event.target.value,
                }))
              }
            />
          </label>
        </div>
        <div className="mt-5 space-y-3">
          {draft.steps.map((step, index) => (
            <article
              key={index}
              className="rounded-lg border border-white/10 bg-black/20 p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-medium text-white/80">Step {index + 1}</h3>
                {!readOnly && draft.steps.length > 1 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        steps: current.steps.filter(
                          (_, stepIndex) => stepIndex !== index,
                        ),
                      }))
                    }
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm text-white/70">
                  Step title
                  <input
                    aria-label={`Step ${index + 1} title`}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-white"
                    value={step.title}
                    disabled={readOnly}
                    onChange={(event) =>
                      updateStep(index, { title: event.target.value })
                    }
                  />
                </label>
                <label className="text-sm text-white/70">
                  Renderer
                  <select
                    aria-label={`Step ${index + 1} renderer`}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-white"
                    value={step.rendererSlug}
                    disabled={readOnly}
                    onChange={(event) =>
                      updateStep(index, { rendererSlug: event.target.value })
                    }
                  >
                    {listAuthoringRendererSlugs().map((slug) => (
                      <option key={slug} value={slug}>
                        {RENDERER_LABELS[slug] ?? slug}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="mt-3 block text-sm text-white/70">
                Explanation
                <textarea
                  aria-label={`Step ${index + 1} explanation`}
                  className="mt-1 min-h-20 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-white"
                  value={step.explanation}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateStep(index, { explanation: event.target.value })
                  }
                />
              </label>
            </article>
          ))}
        </div>
        {!readOnly ? (
          <Button
            variant="ghost"
            className="mt-4 w-full border border-dashed border-border text-muted-foreground hover:text-foreground"
            onClick={() =>
              setDraft((current) => ({
                ...current,
                steps: [...current.steps, newDraftStep()],
              }))
            }
          >
            + Add step
          </Button>
        ) : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={onClose}>
            {readOnly ? "Close" : "Cancel"}
          </Button>
          {!readOnly ? (
            <Button
              size="sm"
              onClick={() => void save()}
              disabled={saving || !auth}
            >
              {saving ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : null}
              {saving ? "Saving…" : "Save Guided Flow"}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GuidedFlowsManager() {
  const { auth } = useAuth();
  const [definitions, setDefinitions] = useState<FlowDefinition[]>(
    BUILTIN_START_OPTIONS,
  );
  const [editor, setEditor] = useState<{
    mode: "create" | "edit" | "view";
    definition?: FlowDefinition;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FlowDefinition | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!auth) return;
    setError(null);
    try {
      const response = await fetch("/api/kody/guided-flows?view=templates", {
        headers: buildAuthHeaders(auth),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      const payload = (await response.json()) as {
        definitions?: FlowDefinition[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load Guided Flows");
      }
      setDefinitions(payload.definitions ?? BUILTIN_START_OPTIONS);
    } catch (cause) {
      setError(
        cause instanceof DOMException && cause.name === "TimeoutError"
          ? "Guided Flows took too long to load. Try again."
          : cause instanceof Error
            ? cause.message
            : "Unable to load Guided Flows",
      );
    }
  }, [auth]);

  const deleteDefinition = useCallback(
    async (definition: FlowDefinition) => {
      if (!auth) return;
      setDeleting(true);
      setError(null);
      try {
        const response = await fetch("/api/kody/guided-flows", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...buildAuthHeaders(auth),
          },
          body: JSON.stringify({
            action: "delete-definition",
            flowId: definition.id,
          }),
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to delete Guided Flow");
        }
        setDefinitions((current) =>
          current.filter((candidate) => candidate.id !== definition.id),
        );
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to delete Guided Flow",
        );
      } finally {
        setDeleting(false);
      }
    },
    [auth],
  );
  useEffect(() => void load(), [load]);
  return (
    <PageShell
      title="Guided Flow Management"
      subtitle="View and manage the reusable step-by-step experiences available to users."
      icon={Route}
      iconClassName="text-teal-300"
      width="wide"
      backHref={auth ? repoScopedHref(auth, "/") : null}
    >
      <div className="space-y-8">
        {error ? (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200"
          >
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : null}
        {editor ? (
          <FlowBuilder
            key={`${editor.mode}:${editor.definition?.id ?? "new"}`}
            mode={editor.mode}
            definition={editor.definition}
            onClose={() => setEditor(null)}
            onSaved={(definition) => {
              setDefinitions((current) => {
                const exists = current.some(
                  (candidate) => candidate.id === definition.id,
                );
                return exists
                  ? current.map((candidate) =>
                      candidate.id === definition.id ? definition : candidate,
                    )
                  : [...current, definition];
              });
              setEditor(null);
            }}
          />
        ) : null}
        <section aria-label="Guided Flow definitions">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white/90">
                Flow definitions
              </h2>
              <p className="mt-1 text-sm text-white/50">
                View, edit, and remove reusable Guided Flow definitions.
                Built-in definitions are read-only.
              </p>
            </div>
            <Button size="sm" onClick={() => setEditor({ mode: "create" })}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Guided Flow
            </Button>
          </div>
          <ul className="space-y-2">
            {definitions.map((option) => (
              <li key={option.id}>
                <Card
                role="article"
                aria-label={option.title}
                className="border-white/[0.08] bg-white/[0.03]"
              >
                <CardContent className="flex items-center justify-between gap-4 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-white/90">
                      {option.title}
                    </h3>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-white/50">
                      {isBuiltinDefinition(option) ? "Built-in" : "Custom"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-white/50">
                    {option.description ??
                      `${option.steps.length} guided step${option.steps.length === 1 ? "" : "s"}.`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`View ${option.title}`}
                    onClick={() =>
                      setEditor({ mode: "view", definition: option })
                    }
                  >
                    <Eye className="mr-1.5 h-4 w-4" />
                    View
                  </Button>
                  {!isBuiltinDefinition(option) ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Edit ${option.title}`}
                        onClick={() =>
                          setEditor({ mode: "edit", definition: option })
                        }
                      >
                        <Pencil className="mr-1.5 h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${option.title}`}
                        onClick={() => setDeleteTarget(option)}
                      >
                        <Trash2 className="mr-1.5 h-4 w-4" />
                        Delete
                      </Button>
                    </>
                  ) : null}
                </div>
                </CardContent>
              </Card>
              </li>
            ))}
          </ul>
        </section>
        <ConfirmDialog
          open={Boolean(deleteTarget)}
          title="Delete Guided Flow"
          description={
            deleteTarget
              ? `Delete “${deleteTarget.title}”? New users will no longer be able to start this definition.`
              : ""
          }
          confirmLabel={deleting ? "Deleting…" : "Delete"}
          variant="destructive"
          onConfirm={() => {
            if (deleteTarget) void deleteDefinition(deleteTarget);
          }}
          onClose={() => {
            if (!deleting) setDeleteTarget(null);
          }}
        />
      </div>
    </PageShell>
  );
}

export default function GuidedFlowsPage() {
  return (
    <AuthGuard>
      <GuidedFlowsManager />
    </AuthGuard>
  );
}

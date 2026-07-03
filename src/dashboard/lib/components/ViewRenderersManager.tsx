/**
 * @fileType component
 * @domain view-renderers
 * @pattern state-repo-manager
 * @ai-summary CRUD UI for renderer JSON definitions stored at
 *   `views/renderers/<slug>.json` in the state repo.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ExternalLink,
  LayoutGrid,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { AuthGuard } from "../auth-guard";
import { buildAuthHeaders, useAuth } from "../auth-context";
import { cn } from "../utils";
import { Button } from "@dashboard/ui/button";
import { Label } from "@dashboard/ui/label";
import { Textarea } from "@dashboard/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@dashboard/ui/dialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { EmptyState } from "./EmptyState";
import { MasterDetailShell } from "./MasterDetailShell";

interface RendererRow {
  slug: string;
  name: string;
  description: string;
  purpose: string;
  rule: string;
  defaults?: Record<string, unknown>;
  type: "layout";
  blocks: Array<{ type: string; bind: string; label?: string }>;
  source: "repo" | "builtin";
  htmlUrl: string;
  readOnly: boolean;
  definition: string;
}

interface RendererPreviewAction {
  id: string;
  label: string;
  response: string;
  variant?: "primary" | "secondary" | "danger";
}

type RendererPreviewValue =
  | string
  | number
  | boolean
  | null
  | RendererPreviewAction[];

interface RendererQueryScope {
  owner?: string | null;
  repo?: string | null;
}

const SAMPLE_VALUES: Record<string, string> = {
  title: "Create this issue?",
  body: "Kody will continue only after you approve.",
};

const DEFAULT_RENDERER_JSON = JSON.stringify(
  {
    slug: "my-renderer",
    name: "My renderer",
    description: "Reusable UI shape.",
    purpose: "approval",
    rule:
      "Use this purpose when Kody asks the user to approve, edit, cancel, or continue before taking the next step.",
    defaults: {
      actions: [
        {
          id: "approve",
          label: "Approve",
          response: "approve",
          variant: "primary",
        },
        {
          id: "edit",
          label: "Edit first",
          response: "edit",
          variant: "secondary",
        },
        {
          id: "cancel",
          label: "Cancel",
          response: "cancel",
          variant: "secondary",
        },
      ],
    },
    type: "layout",
    blocks: [
      { type: "title", bind: "title" },
      { type: "text", bind: "body" },
      { type: "buttons", bind: "actions" },
    ],
  },
  null,
  2,
);

const viewRendererQueryKeys = {
  all: ["view-renderers"] as const,
  list: (scope: RendererQueryScope = {}) =>
    ["view-renderers", scope.owner ?? null, scope.repo ?? null] as const,
};

function parseRendererJson(raw: string): RendererRow | null {
  try {
    const parsed = JSON.parse(raw) as Partial<RendererRow>;
    if (
      typeof parsed.slug !== "string" ||
      typeof parsed.name !== "string" ||
      typeof parsed.purpose !== "string" ||
      parsed.type !== "layout" ||
      !Array.isArray(parsed.blocks)
    ) {
      return null;
    }
    const defaults =
      parsed.defaults && typeof parsed.defaults === "object"
        ? (parsed.defaults as Record<string, unknown>)
        : null;
    return {
      slug: parsed.slug,
      name: parsed.name,
      description:
        typeof parsed.description === "string" ? parsed.description : "",
      purpose: parsed.purpose,
      rule: typeof parsed.rule === "string" ? parsed.rule : "",
      ...(defaults ? { defaults } : {}),
      type: "layout",
      blocks: parsed.blocks as RendererRow["blocks"],
      source: "repo",
      htmlUrl: "",
      readOnly: false,
      definition: raw,
    };
  } catch {
    return null;
  }
}

async function listRenderersApi(
  headers: Record<string, string>,
): Promise<RendererRow[]> {
  const res = await fetch("/api/kody/view-renderers", {
    headers,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    renderers?: RendererRow[];
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(json.message || json.error || `HTTP ${res.status}`);
  }
  return json.renderers ?? [];
}

async function saveRendererApi(
  headers: Record<string, string>,
  definition: string,
  isNew: boolean,
  actorLogin?: string,
): Promise<RendererRow> {
  const parsed = parseRendererJson(definition);
  if (!parsed) throw new Error("Renderer JSON is invalid.");
  const res = await fetch(
    isNew
      ? "/api/kody/view-renderers"
      : `/api/kody/view-renderers/${encodeURIComponent(parsed.slug)}`,
    {
      method: isNew ? "POST" : "PATCH",
      headers,
      body: JSON.stringify({ definition, actorLogin }),
    },
  );
  const json = (await res.json().catch(() => ({}))) as {
    renderer?: RendererRow;
    error?: string;
    message?: string;
  };
  if (!res.ok || !json.renderer) {
    throw new Error(json.message || json.error || `HTTP ${res.status}`);
  }
  return json.renderer;
}

async function deleteRendererApi(
  headers: Record<string, string>,
  slug: string,
  actorLogin?: string,
): Promise<void> {
  const params = new URLSearchParams();
  if (actorLogin) params.set("actorLogin", actorLogin);
  const suffix = params.toString() ? `?${params}` : "";
  const res = await fetch(
    `/api/kody/view-renderers/${encodeURIComponent(slug)}${suffix}`,
    { method: "DELETE", headers },
  );
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(json.message || json.error || `HTTP ${res.status}`);
  }
}

export function ViewRenderersManager({
  initialSlug = null,
}: {
  initialSlug?: string | null;
}) {
  return (
    <AuthGuard>
      <ViewRenderersManagerInner initialSlug={initialSlug} />
    </AuthGuard>
  );
}

function ViewRenderersManagerInner({
  initialSlug,
}: {
  initialSlug: string | null;
}) {
  const router = useRouter();
  const { auth } = useAuth();
  const headers = useMemo<Record<string, string>>(
    () => ({
      "Content-Type": "application/json",
      ...buildAuthHeaders(auth),
    }),
    [auth],
  );
  const queryClient = useQueryClient();
  const queryScope = { owner: auth?.owner ?? null, repo: auth?.repo ?? null };
  const listQueryKey = viewRendererQueryKeys.list(queryScope);
  const actorLogin = auth?.user.login;
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSlug);
  const [definition, setDefinition] = useState(DEFAULT_RENDERER_JSON);
  const [isNew, setIsNew] = useState(false);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<RendererRow | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<RendererRow[]>({
    queryKey: listQueryKey,
    queryFn: () => listRenderersApi(headers),
    enabled: !!auth,
    staleTime: 30_000,
  });
  const renderers = useMemo(() => data ?? [], [data]);
  const selected = selectedSlug
    ? renderers.find((renderer) => renderer.slug === selectedSlug) ?? null
    : null;
  const draft = parseRendererJson(definition);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return renderers;
    return renderers.filter((renderer) =>
      [
        renderer.slug,
        renderer.name,
        renderer.description,
        renderer.purpose,
        renderer.rule,
        JSON.stringify(renderer.defaults ?? {}),
        renderer.type,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [renderers, search]);

  useEffect(() => {
    if (isNew || selectedSlug || initialSlug || renderers.length === 0) return;
    const first = renderers[0];
    setSelectedSlug(first.slug);
    setDefinition(first.definition);
  }, [initialSlug, isNew, selectedSlug, renderers]);

  useEffect(() => {
    if (!initialSlug) return;
    setSelectedSlug(initialSlug);
    const selectedRenderer = renderers.find(
      (renderer) => renderer.slug === initialSlug,
    );
    if (selectedRenderer) {
      setDefinition(selectedRenderer.definition);
      setIsNew(false);
    }
  }, [initialSlug, renderers]);

  const save = useMutation({
    mutationFn: () => saveRendererApi(headers, definition, isNew, actorLogin),
    onSuccess: (renderer) => {
      queryClient.invalidateQueries({ queryKey: viewRendererQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: listQueryKey });
      setSelectedSlug(renderer.slug);
      setDefinition(renderer.definition);
      setIsNew(false);
      setEditorOpen(false);
      router.replace(`/views/renderers/${encodeURIComponent(renderer.slug)}`);
      toast.success("Saved");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save"),
  });

  const remove = useMutation({
    mutationFn: (renderer: RendererRow) =>
      deleteRendererApi(headers, renderer.slug, actorLogin),
    onSuccess: async () => {
      setDeleting(null);
      setSelectedSlug(null);
      setDefinition(DEFAULT_RENDERER_JSON);
      setIsNew(false);
      router.replace("/views/renderers");
      await queryClient.invalidateQueries({ queryKey: listQueryKey });
      toast.success("Deleted");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to delete"),
  });

  function startNew() {
    setSelectedSlug(null);
    setDefinition(DEFAULT_RENDERER_JSON);
    setIsNew(true);
    setEditorOpen(true);
    router.push("/views/renderers");
  }

  function selectRenderer(renderer: RendererRow) {
    setSelectedSlug(renderer.slug);
    setDefinition(renderer.definition);
    setIsNew(false);
    router.push(`/views/renderers/${encodeURIComponent(renderer.slug)}`);
  }

  function editCurrent() {
    if (!selected && !isNew) return;
    setEditorOpen(true);
  }

  const detail =
    draft && (selected || isNew) ? (
      <RendererPreviewDetail
        draft={draft}
        isNew={isNew}
        selected={selected}
        onEdit={editCurrent}
        onDelete={() => selected && setDeleting(selected)}
      />
    ) : (
      <EmptyState
        icon={<LayoutGrid />}
        title="Select a renderer"
        hint="Pick a renderer to preview it."
      />
    );

  return (
    <MasterDetailShell
      title="View Renderers"
      icon={LayoutGrid}
      iconClassName="text-cyan-300"
      subtitle={auth ? `${auth.owner}/${auth.repo}` : undefined}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search renderers..."
      searchAriaLabel="Search view renderers"
      accent="teal"
      hasSelection={isNew || Boolean(selected)}
      detail={detail}
      actions={
        <Button size="sm" className="gap-1" onClick={startNew}>
          <Plus className="h-4 w-4" />
          New renderer
        </Button>
      }
    >
      {isLoading ? (
        <EmptyState
          icon={<Loader2 className="animate-spin" />}
          title="Loading renderers..."
        />
      ) : error ? (
        <EmptyState
          icon={<LayoutGrid />}
          title="Could not load renderers"
          hint={error instanceof Error ? error.message : "Unknown error"}
          action={
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid />}
          title={renderers.length === 0 ? "No renderers yet" : "No matches"}
          hint={
            renderers.length === 0
              ? "Create the first renderer JSON."
              : "Try another search."
          }
          action={
            renderers.length === 0 ? (
              <Button size="sm" className="gap-1" onClick={startNew}>
                <Plus className="h-4 w-4" />
                New renderer
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map((renderer) => {
            const isActive = selectedSlug === renderer.slug && !isNew;
            return (
              <li key={renderer.slug}>
                <button
                  type="button"
                  onClick={() => selectRenderer(renderer)}
                  className={cn(
                    "relative w-full px-4 py-3 text-start transition-colors hover:bg-accent/50",
                    isActive && "bg-accent/70",
                  )}
                >
                  {isActive ? (
                    <span className="absolute inset-y-0 left-0 w-0.5 bg-cyan-300" />
                  ) : null}
                  <div className="flex items-start gap-2">
                    <LayoutGrid className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-medium text-white/90">
                          {renderer.name}
                        </p>
                        <SourceBadge source={renderer.source} />
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {renderer.slug} · {renderer.purpose} ·{" "}
                        {renderer.blocks.length} blocks
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name}?`}
        description="This removes the renderer JSON from the state repo."
        confirmLabel={remove.isPending ? "Deleting..." : "Delete"}
        variant="destructive"
        onConfirm={() => {
          if (deleting) remove.mutate(deleting);
        }}
        onClose={() => setDeleting(null)}
      />
      <RendererEditorDialog
        open={editorOpen}
        definition={definition}
        isNew={isNew}
        isSaving={save.isPending}
        onOpenChange={setEditorOpen}
        onChange={setDefinition}
        onSave={() => save.mutate()}
      />
    </MasterDetailShell>
  );
}

function RendererPreviewDetail({
  draft,
  isNew,
  selected,
  onEdit,
  onDelete,
}: {
  draft: RendererRow;
  isNew: boolean;
  selected: RendererRow | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const previewData = buildRendererPreviewData(draft);
  return (
    <div className="min-h-full">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-white/90">
            {draft.name}
          </h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {draft.slug} · purpose: {draft.purpose}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isNew && selected?.htmlUrl ? (
            <Button asChild variant="ghost" size="sm" className="gap-1">
              <a href={selected.htmlUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Source
              </a>
            </Button>
          ) : null}
          <Button size="sm" className="gap-1" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          {!isNew && selected?.source === "repo" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 text-rose-300 hover:text-rose-200"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      <div className="px-4 py-5 md:px-6">
        <div className="mb-4 max-w-2xl rounded-md border border-cyan-400/15 bg-cyan-950/10 p-4">
          <p className="text-sm font-medium text-white/85">Preview</p>
          <div className="mt-3 rounded-md border border-white/[0.08] bg-black/20 p-4">
            <div className="space-y-3">
              {draft.blocks.map((block, index) => (
                <RendererBlockPreview
                  key={`${block.type}-${block.bind}-${index}`}
                  block={block}
                  value={previewData[block.bind]}
                />
              ))}
            </div>
          </div>
        </div>
        {draft.rule ? (
          <div className="mb-4 max-w-2xl rounded-md border border-white/[0.08] bg-black/20 p-4">
            <p className="text-sm font-medium text-white/85">Rule</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {draft.rule}
            </p>
          </div>
        ) : null}
        {draft.defaults ? (
          <div className="mb-4 max-w-2xl rounded-md border border-white/[0.08] bg-black/20 p-4">
            <p className="text-sm font-medium text-white/85">Defaults</p>
            <pre className="mt-2 overflow-auto text-xs leading-5 text-muted-foreground">
              {JSON.stringify(draft.defaults, null, 2)}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function isPreviewAction(value: unknown): value is RendererPreviewAction {
  if (!value || typeof value !== "object") return false;
  const action = value as Record<string, unknown>;
  const validVariant =
    action.variant === undefined ||
    action.variant === "primary" ||
    action.variant === "secondary" ||
    action.variant === "danger";
  return (
    typeof action.id === "string" &&
    typeof action.label === "string" &&
    typeof action.response === "string" &&
    validVariant
  );
}

function isPreviewActionList(value: unknown): value is RendererPreviewAction[] {
  return Array.isArray(value) && value.every(isPreviewAction);
}

function clonePreviewValue(value: unknown): RendererPreviewValue | undefined {
  if (value === null) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (isPreviewActionList(value)) {
    return value.map((action) => ({ ...action }));
  }
  return undefined;
}

function buildRendererPreviewData(
  renderer: RendererRow,
): Record<string, RendererPreviewValue> {
  const data: Record<string, RendererPreviewValue> = {};
  for (const [key, value] of Object.entries(renderer.defaults ?? {})) {
    const cloned = clonePreviewValue(value);
    if (cloned !== undefined) data[key] = cloned;
  }
  for (const block of renderer.blocks) {
    if (data[block.bind] !== undefined) continue;
    if (block.type === "buttons") {
      data[block.bind] = [];
    } else {
      data[block.bind] = SAMPLE_VALUES[block.bind] ?? block.label ?? block.bind;
    }
  }
  return data;
}

function RendererEditorDialog({
  open,
  definition,
  isNew,
  isSaving,
  onOpenChange,
  onChange,
  onSave,
}: {
  open: boolean;
  definition: string;
  isNew: boolean;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const isValid = Boolean(parseRendererJson(definition));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>{isNew ? "New renderer" : "Edit renderer"}</DialogTitle>
          <DialogDescription>
            Edit the JSON that defines this renderer.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-5 py-4">
          <Label htmlFor="renderer-json-modal">Renderer JSON</Label>
          <Textarea
            id="renderer-json-modal"
            value={definition}
            onChange={(event) => onChange(event.target.value)}
            className="min-h-[58vh] font-mono text-xs leading-5"
            spellCheck={false}
          />
          {!isValid ? (
            <p className="text-xs text-rose-300">
              JSON must include slug, name, purpose, type "layout", and blocks.
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="gap-1" disabled={!isValid || isSaving} onClick={onSave}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RendererBlockPreview({
  block,
  value,
}: {
  block: RendererRow["blocks"][number];
  value: RendererPreviewValue | undefined;
}) {
  if (block.type === "title") {
    return (
      <h3 className="text-base font-semibold leading-6 text-white/90">
        {String(value ?? "")}
      </h3>
    );
  }
  if (block.type === "text" || block.type === "markdown") {
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        {String(value ?? "")}
      </p>
    );
  }
  if (block.type === "buttons") {
    const actions = isPreviewActionList(value) ? value : [];
    return (
      <div className="flex flex-wrap gap-2">
        {actions.length > 0 ? (
          actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={cn(
                "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                action.variant === "primary"
                  ? "border-cyan-300 bg-cyan-300 text-black"
                  : action.variant === "danger"
                    ? "border-rose-400/50 bg-rose-500/15 text-rose-200"
                    : "border-white/[0.12] bg-white/[0.05] text-white/75",
              )}
            >
              {action.label}
            </button>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">No actions configured.</p>
        )}
      </div>
    );
  }
  return (
    <label className="block">
      <span className="text-xs font-medium text-white/70">
        {block.label ?? block.bind}
      </span>
      <input
        className="mt-1 h-9 w-full rounded-md border border-white/[0.12] bg-black/20 px-3 text-sm text-white/80"
        value={String(value ?? "")}
        readOnly
      />
    </label>
  );
}

function SourceBadge({ source }: { source: RendererRow["source"] }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
        source === "repo"
          ? "bg-emerald-500/15 text-emerald-300"
          : "bg-white/[0.08] text-white/50",
      )}
    >
      {source}
    </span>
  );
}

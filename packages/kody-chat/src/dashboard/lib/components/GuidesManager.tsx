/**
 * @fileType component
 * @domain guides
 * @pattern guides-manager
 * @ai-summary CRUD UI for guides — a thin progression layer over a CMS
 *   collection. The operator picks the collection whose documents are the
 *   ordered steps and maps the step fields; step content itself is edited in
 *   the CMS content UI, not here (no duplicate data). Follows the standard
 *   admin-page structure (PageShell + card rows + Power toggle + ui-kit
 *   dialog editor).
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
  Route,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@kody-ade/base/ui/select";
import { slugifyTitle } from "@kody-ade/base/slug";
import { buildAuthHeaders, useAuth } from "@dashboard/lib/auth-context";
import { ConfirmDialog } from "./ConfirmDialog";
import { EmptyState } from "./EmptyState";
import { PageShell } from "./PageShell";

interface GuideSource {
  collection: string;
  orderField: string;
  idField: string;
  titleField: string;
  instructionField: string;
  advanceField?: string;
  keywordField?: string;
  defaultAdvance: "model" | "keyword";
}

interface GuideRow {
  slug: string;
  title: string;
  description: string;
  enabled: boolean;
  source: GuideSource;
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

function emptyGuide(): EditorState {
  return {
    slug: "",
    title: "",
    description: "",
    enabled: true,
    source: {
      collection: "",
      orderField: "order",
      idField: "id",
      titleField: "title",
      instructionField: "instruction",
      defaultAdvance: "model",
    },
    isNew: true,
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
    mutationFn: (state: EditorState) => {
      const src = state.source;
      return fetchJson("/api/kody/guides", headers, {
        method: "POST",
        body: JSON.stringify({
          guide: {
            slug: state.isNew ? slugifyTitle(state.title) : state.slug,
            title: state.title.trim(),
            description: state.description.trim(),
            enabled: state.enabled,
            source: {
              collection: src.collection.trim(),
              orderField: src.orderField.trim() || "order",
              idField: src.idField.trim() || "id",
              titleField: src.titleField.trim() || "title",
              instructionField: src.instructionField.trim() || "instruction",
              defaultAdvance: src.defaultAdvance,
              ...(src.advanceField?.trim()
                ? { advanceField: src.advanceField.trim() }
                : {}),
              ...(src.keywordField?.trim()
                ? { keywordField: src.keywordField.trim() }
                : {}),
            },
          },
        }),
      });
    },
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

  const setSource = (patch: Partial<GuideSource>) =>
    setEditor((current) =>
      current
        ? { ...current, source: { ...current.source, ...patch } }
        : current,
    );

  return (
    <PageShell
      title="Guides"
      icon={Route}
      subtitle="Ordered steps that guide the chat, one step at a time. Steps come from a content collection."
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
            onClick={() => setEditor(emptyGuide())}
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
          hint="Point a guide at a content collection; the chat follows its documents as ordered steps."
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
                      steps from <code>{guide.source.collection}</code>
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
        <DialogContent modalSize="wide">
          <DialogHeader>
            <DialogTitle>
              {editor?.isNew ? "New guide" : "Edit guide"}
            </DialogTitle>
            <DialogDescription>
              Steps are the documents of a content collection; edit their
              text in Content. Here you bind the collection and its fields.
            </DialogDescription>
          </DialogHeader>
          {editor ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="guide-title">Title</Label>
                  <Input
                    id="guide-title"
                    value={editor.title}
                    placeholder="Onboarding"
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

              <div className="space-y-1">
                <Label htmlFor="guide-collection">Steps collection</Label>
                <Input
                  id="guide-collection"
                  value={editor.source.collection}
                  placeholder="lessons"
                  onChange={(e) => setSource({ collection: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Order field</Label>
                  <Input
                    value={editor.source.orderField}
                    onChange={(e) => setSource({ orderField: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Id field</Label>
                  <Input
                    value={editor.source.idField}
                    onChange={(e) => setSource({ idField: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Title field</Label>
                  <Input
                    value={editor.source.titleField}
                    onChange={(e) => setSource({ titleField: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Instruction field</Label>
                  <Input
                    value={editor.source.instructionField}
                    onChange={(e) =>
                      setSource({ instructionField: e.target.value })
                    }
                  />
                </div>
              </div>

              <details className="rounded-md border border-border px-3 py-2">
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  Advanced (how steps advance)
                </summary>
                <div className="mt-3 space-y-3">
                  <div className="space-y-1">
                    <Label>Default advance</Label>
                    <Select
                      value={editor.source.defaultAdvance}
                      onValueChange={(value) =>
                        setSource({
                          defaultAdvance: value as "model" | "keyword",
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="model">
                          model decides when ready
                        </SelectItem>
                        <SelectItem value="keyword">
                          answer must contain a keyword
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Advance field (optional)</Label>
                      <Input
                        value={editor.source.advanceField ?? ""}
                        placeholder="per-step override"
                        onChange={(e) =>
                          setSource({ advanceField: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Keyword field (optional)</Label>
                      <Input
                        value={editor.source.keywordField ?? ""}
                        onChange={(e) =>
                          setSource({ keywordField: e.target.value })
                        }
                      />
                    </div>
                  </div>
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
                    !editor.title.trim() ||
                    !editor.source.collection.trim()
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
        description={`"${deleteTarget?.title}" will be removed. Its steps stay in the content collection.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.slug)}
      />
    </PageShell>
  );
}

/**
 * @fileType component
 * @domain files
 * @pattern file-editor
 * @ai-summary Editable Monaco Editor for the /files page. Supports
 *   read-only / edit mode, unsaved changes indicator, Ctrl+S save, and
 *   Markdown preview/split modes.
 */
"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import type { EditorProps } from "@monaco-editor/react";
import {
  Save,
  Undo2,
  Loader2,
  Eye,
  Edit3,
  Columns,
  FileText,
  PanelLeft,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@kody-ade/base/ui/button";
import { cn } from "@dashboard/lib/utils";
import { monacoLanguage } from "../lib/repo-files-lang";
import { readFile, writeFile } from "../lib/repo-files";
import { useFilesTransport } from "../lib/transport";
import type { Octokit } from "@octokit/rest";
import { MarkdownPreview } from "@dashboard/lib/components/MarkdownPreview";
import {
  autoDirProps,
  rtlAwareMarkdownClassName,
} from "@dashboard/lib/text-direction";
import { CommitMessageDialog } from "./CommitMessageDialog";
import { useTheme } from "@dashboard/providers/Theme";
import { createLatestRequestGuard } from "../lib/latest-request";
import {
  fileDraftStorageKey,
  parseFileDraft,
  serializeFileDraft,
} from "../lib/file-drafts";

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.Editor),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
) as React.ComponentType<EditorProps>;

export type FileEditorViewMode = "edit" | "preview" | "split";

interface FileEditorProps {
  path: string;
  sha: string;
  octokit: Octokit | null;
  owner: string;
  repo: string;
  onSaved: () => void;
  onShowFilePanel?: () => void;
  defaultMarkdownViewMode?: FileEditorViewMode;
}

export function FileEditor({
  path,
  sha,
  octokit,
  owner,
  repo,
  onSaved,
  onShowFilePanel,
  defaultMarkdownViewMode = "edit",
}: FileEditorProps) {
  const { theme } = useTheme();
  const [originalContent, setOriginalContent] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<FileEditorViewMode>(
    defaultMarkdownViewMode,
  );
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [loadedSha, setLoadedSha] = useState(sha);
  const requestGuard = useMemo(() => createLatestRequestGuard(), []);
  const transport = useFilesTransport();

  const isMarkdown = path.endsWith(".md") || path.endsWith(".mdx");
  const draftStorageKey = useMemo(
    () => fileDraftStorageKey(owner, repo, path),
    [owner, repo, path],
  );

  // Load file content on mount
  useEffect(() => {
    if ((!transport && !octokit) || !path) return;
    const requestId = requestGuard.next();

    const load = async () => {
      setLoading(true);
      setDraftReady(false);
      setError(null);
      try {
        const file = transport
          ? await transport.readFile(path)
          : await readFile(octokit!, owner, repo, path);
        if (!requestGuard.isCurrent(requestId)) return;
        if (!file) {
          setError("File not found");
          return;
        }
        if (file.isBinary) {
          setError("Binary files cannot be edited");
          return;
        }
        setLoadedSha(file.sha);
        setOriginalContent(file.content);
        const storedDraft = localStorage.getItem(draftStorageKey);
        if (storedDraft) {
          const draft = parseFileDraft(storedDraft);
          if (!draft) {
            localStorage.removeItem(draftStorageKey);
            setContent(file.content);
          } else {
            setContent(draft.content);
            if (draft.baseSha !== file.sha) {
              toast.info(
                "Recovered a local draft based on an older file revision.",
              );
            }
          }
        } else {
          setContent(file.content);
        }
        setDraftReady(true);
      } catch (err) {
        if (!requestGuard.isCurrent(requestId)) return;
        setError(err instanceof Error ? err.message : "Failed to load file");
      } finally {
        if (requestGuard.isCurrent(requestId)) setLoading(false);
      }
    };
    void load();

    return () => {
      if (requestGuard.isCurrent(requestId)) requestGuard.invalidate();
    };
  }, [transport, octokit, owner, repo, path, draftStorageKey, requestGuard]);

  // Track dirty state
  useEffect(() => {
    setIsDirty(content !== originalContent);
  }, [content, originalContent]);

  useEffect(() => {
    if (!draftReady) return;

    if (content === originalContent) {
      localStorage.removeItem(draftStorageKey);
      return;
    }

    const persistDraft = () => {
      try {
        localStorage.setItem(
          draftStorageKey,
          serializeFileDraft({
            content,
            baseSha: loadedSha,
            updatedAt: Date.now(),
          }),
        );
      } catch {
        // Editing must continue even if browser storage is unavailable.
      }
    };
    const timeout = window.setTimeout(persistDraft, 300);
    window.addEventListener("beforeunload", persistDraft);

    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("beforeunload", persistDraft);
      persistDraft();
    };
  }, [content, draftReady, draftStorageKey, loadedSha, originalContent]);

  // Keyboard shortcut: Ctrl+S / Cmd+S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty && !saving) {
          setShowCommitDialog(true);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDirty, saving]);

  const handleEditorChange = useCallback((value: string | undefined) => {
    setContent(value ?? "");
  }, []);

  const handleSave = useCallback(
    async (message: string) => {
      if (transport ? !transport.writeFile : !octokit) return;
      setSaving(true);
      try {
        let nextSha = loadedSha;
        if (transport) {
          await transport.writeFile!(path, content);
        } else {
          const result = await writeFile(
            octokit!,
            owner,
            repo,
            path,
            content,
            message,
            loadedSha,
          );
          nextSha = result.sha;
        }
        localStorage.removeItem(draftStorageKey);
        setLoadedSha(nextSha);
        setOriginalContent(content);
        setIsDirty(false);
        toast.success("File saved");
        setShowCommitDialog(false);
        onSaved();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save file");
      } finally {
        setSaving(false);
      }
    },
    [transport, octokit, owner, repo, path, content, loadedSha, onSaved, draftStorageKey],
  );

  const handleDiscard = useCallback(() => {
    const confirmed = window.confirm(
      "Discard unsaved changes? This cannot be undone.",
    );
    if (!confirmed) return;

    localStorage.removeItem(draftStorageKey);
    setContent(originalContent);
    setIsDirty(false);
  }, [draftStorageKey, originalContent]);

  const fileName = path.split("/").pop() ?? path;
  const parentPath = path.includes("/")
    ? path.slice(0, path.lastIndexOf("/"))
    : "Repository root";

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <div className="flex min-h-[4.75rem] shrink-0 items-center gap-5 border-b border-border px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {onShowFilePanel ? (
                <Button
                  variant="ghost"
                  size="clear"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={onShowFilePanel}
                  title="Show file panel"
                  aria-label="Show file panel"
                >
                  <PanelLeft className="h-4 w-4" />
                </Button>
              ) : null}
              <h2 className="truncate text-lg font-semibold tracking-tight">
                {fileName}
              </h2>
              {isDirty && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.68rem] font-medium uppercase tracking-wider text-primary">
                  Unsaved
                </span>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {parentPath}
            </p>
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {isMarkdown && (
            <div className="mr-2 flex items-center rounded-xl border border-border bg-muted/40 p-1">
              <Button
                variant="ghost"
                size="clear"
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-lg",
                  viewMode === "edit"
                    ? "bg-background text-foreground shadow-sm hover:bg-background hover:text-foreground"
                    : "text-muted-foreground hover:bg-transparent hover:text-foreground",
                )}
                onClick={() => setViewMode("edit")}
                title="Edit mode"
                aria-label="Edit mode"
                aria-pressed={viewMode === "edit"}
              >
                <Edit3 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="clear"
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-lg",
                  viewMode === "preview"
                    ? "bg-background text-foreground shadow-sm hover:bg-background hover:text-foreground"
                    : "text-muted-foreground hover:bg-transparent hover:text-foreground",
                )}
                onClick={() => setViewMode("preview")}
                title="Preview mode"
                aria-label="Preview mode"
                aria-pressed={viewMode === "preview"}
              >
                <Eye className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="clear"
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-lg",
                  viewMode === "split"
                    ? "bg-background text-foreground shadow-sm hover:bg-background hover:text-foreground"
                    : "text-muted-foreground hover:bg-transparent hover:text-foreground",
                )}
                onClick={() => setViewMode("split")}
                title="Split mode"
                aria-label="Split mode"
                aria-pressed={viewMode === "split"}
              >
                <Columns className="h-4 w-4" />
              </Button>
            </div>
          )}

          {isDirty ? (
            <Button
              variant="ghost"
              size="clear"
              onClick={handleDiscard}
              className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Discard unsaved changes"
              aria-label="Discard unsaved changes"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
          ) : null}

          <Button
            variant="default"
            size="clear"
            onClick={() => setShowCommitDialog(true)}
            disabled={!isDirty || saving}
            title="Save changes"
            aria-label="Save changes"
            className={cn(
              "grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90",
              (!isDirty || saving) &&
                "cursor-not-allowed bg-muted text-muted-foreground hover:bg-muted",
            )}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 bg-muted/20 p-3">
        {loading ? (
          <div className="flex items-center justify-center w-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex w-full flex-col items-center justify-center text-muted-foreground">
            <span>{error}</span>
          </div>
        ) : viewMode === "edit" || viewMode === "split" ? (
          <div
            className={cn(
              "min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm",
              viewMode === "split" && "w-1/2 rounded-r-none",
            )}
          >
            <MonacoEditor
              height="100%"
              language={monacoLanguage(path)}
              value={content}
              theme={theme === "light" ? "light" : "vs-dark"}
              onChange={handleEditorChange}
              options={{
                readOnly: false,
                minimap: { enabled: false },
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                fontSize: 15,
                lineHeight: 24,
                padding: { top: 24, bottom: 24 },
                renderLineHighlight: "none",
                overviewRulerBorder: false,
                hideCursorInOverviewRuler: true,
                wordWrap: "on",
                automaticLayout: true,
              }}
            />
          </div>
        ) : null}

        {viewMode === "preview" && (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-card">
            <div className="mx-auto max-w-4xl px-10 py-12 lg:px-16">
              <MarkdownPreview
                {...autoDirProps}
                content={content}
                className={cn(
                  "break-words text-start md:prose-lg",
                  rtlAwareMarkdownClassName,
                )}
              />
            </div>
          </div>
        )}

        {viewMode === "split" && <div className="w-2" />}

        {viewMode === "split" && (
          <div className="min-h-0 w-1/2 overflow-y-auto rounded-r-xl border border-border bg-card">
            <div className="mx-auto max-w-3xl px-8 py-10">
              <MarkdownPreview
                {...autoDirProps}
                content={content}
                className={cn(
                  "break-words text-start md:prose-base",
                  rtlAwareMarkdownClassName,
                )}
              />
            </div>
          </div>
        )}
      </div>

      {showCommitDialog && (
        <CommitMessageDialog
          onConfirm={handleSave}
          onCancel={() => setShowCommitDialog(false)}
          saving={saving}
        />
      )}
    </div>
  );
}

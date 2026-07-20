/**
 * @fileType component
 * @domain files
 * @pattern file-editor
 * @ai-summary Editable Monaco Editor for the /files page. Supports
 *   read-only / edit mode, unsaved changes indicator, Ctrl+S save, and
 *   Markdown preview/split modes.
 */
"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import type { EditorProps } from "@monaco-editor/react";
import { Save, X, Loader2, Eye, Edit3, Columns, FileText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@dashboard/lib/utils";
import { monacoLanguage } from "@dashboard/lib/repo-files-lang";
import { readFile, writeFile } from "@dashboard/lib/repo-files";
import type { Octokit } from "@octokit/rest";
import { MarkdownPreview } from "@dashboard/lib/components/MarkdownPreview";
import {
  autoDirProps,
  rtlAwareMarkdownClassName,
} from "@dashboard/lib/text-direction";
import { CommitMessageDialog } from "./CommitMessageDialog";
import { useTheme } from "@dashboard/providers/Theme";

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
  onCancel: () => void;
  onSaved: () => void;
  defaultMarkdownViewMode?: FileEditorViewMode;
}

export function FileEditor({
  path,
  sha,
  octokit,
  owner,
  repo,
  onCancel,
  onSaved,
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
  const editorRef = useRef<unknown>(null);

  const isMarkdown = path.endsWith(".md") || path.endsWith(".mdx");

  // Load file content on mount
  useEffect(() => {
    if (!octokit || !path) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const file = await readFile(octokit, owner, repo, path);
        if (!file) {
          setError("File not found");
          return;
        }
        setOriginalContent(file.content);
        setContent(file.content);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load file");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [octokit, owner, repo, path]);

  // Track dirty state
  useEffect(() => {
    setIsDirty(content !== originalContent);
  }, [content, originalContent]);

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

  const handleEditorMount = useCallback((editor: unknown) => {
    editorRef.current = editor;
  }, []);

  const handleSave = useCallback(
    async (message: string) => {
      if (!octokit) return;
      setSaving(true);
      try {
        await writeFile(octokit, owner, repo, path, content, message, sha);
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
    [octokit, owner, repo, path, content, sha, onSaved],
  );

  const handleCancel = useCallback(() => {
    if (isDirty) {
      const confirmed = window.confirm(
        "Discard unsaved changes? This cannot be undone.",
      );
      if (!confirmed) return;
    }
    setContent(originalContent);
    setIsDirty(false);
    onCancel();
  }, [isDirty, originalContent, onCancel]);

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
              <button
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs",
                  viewMode === "edit"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setViewMode("edit")}
                title="Edit mode"
              >
                <Edit3 className="h-3.5 w-3.5" />
                Edit
              </button>
              <button
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs",
                  viewMode === "preview"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setViewMode("preview")}
                title="Preview mode"
              >
                <Eye className="h-3.5 w-3.5" />
                Preview
              </button>
              <button
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs",
                  viewMode === "split"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setViewMode("split")}
                title="Split mode"
              >
                <Columns className="h-3.5 w-3.5" />
                Split
              </button>
            </div>
          )}

          <button
            onClick={handleCancel}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm",
              "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <X className="h-4 w-4" />
            Close
          </button>

          <button
            onClick={() => setShowCommitDialog(true)}
            disabled={!isDirty || saving}
            className={cn(
              "flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90",
              (!isDirty || saving) &&
                "cursor-not-allowed bg-muted text-muted-foreground hover:bg-muted",
            )}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save
          </button>
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
              onMount={handleEditorMount}
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

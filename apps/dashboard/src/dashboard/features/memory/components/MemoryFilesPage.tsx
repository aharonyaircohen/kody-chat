"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@kody-ade/base/ui/button";
import {
  FilesPage,
  type FileEntry,
  type FilesTransport,
} from "@dashboard/features/file-manager";
import { AuthGuard } from "@dashboard/lib/auth-guard";
import { useAuth } from "@dashboard/lib/auth-context";
import {
  memoryApi,
  type Memory,
  type MemoryKind,
} from "@dashboard/lib/api/memory";
import {
  MEMORY_KINDS,
  MEMORY_SCOPE_FOLDERS,
  memoryFilePath,
  memoryIdFromFilePath,
  memoryMarkdown,
  type MemoryScopeFolder,
} from "../lib/memory-files";
import { MemoryFormDialog } from "./MemoryFormDialog";
import { MemorySearchDialog } from "./MemorySearchDialog";

function titleCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function normalizedPath(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}

function scopeFolder(memory: Readonly<Memory>): MemoryScopeFolder {
  return memory.scope.kind === "user" ? "personal" : "repository";
}

function directoryEntry(name: string, path: string, size: number): FileEntry {
  return { name, path, type: "dir", size, sha: path };
}

function latestUpdate(memories: readonly Readonly<Memory>[]): string {
  return memories.reduce(
    (latest, memory) => (memory.updatedAt > latest ? memory.updatedAt : latest),
    "",
  );
}

export function MemoryFilesPage({
  initialPath = "",
}: {
  initialPath?: string;
}) {
  const { auth } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const repositoryScope = `${auth?.owner ?? ""}/${auth?.repo ?? ""}`;
  const queryKey = useMemo(
    () => ["memory-files", repositoryScope] as const,
    [repositoryScope],
  );
  const memoriesQuery = useQuery({
    queryKey,
    queryFn: memoryApi.list,
    enabled: Boolean(auth),
    staleTime: 30_000,
  });
  const memories = useMemo(
    () => memoriesQuery.data ?? [],
    [memoriesQuery.data],
  );
  const [creating, setCreating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [editing, setEditing] = useState<Readonly<Memory> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const activePathRef = useRef(initialPath);

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey }),
    [queryClient, queryKey],
  );

  const transport = useMemo<FilesTransport>(
    () => ({
      cacheKey: [
        "memory",
        repositoryScope,
        memories.length,
        latestUpdate(memories),
        memoriesQuery.error instanceof Error ? memoriesQuery.error.message : "",
      ].join(":"),
      async listDir(path: string): Promise<FileEntry[]> {
        if (memoriesQuery.error instanceof Error) throw memoriesQuery.error;
        const parts = normalizedPath(path).split("/").filter(Boolean);
        if (parts.length === 0) {
          return MEMORY_SCOPE_FOLDERS.map((scope) =>
            directoryEntry(
              titleCase(scope),
              scope,
              memories.filter((memory) => scopeFolder(memory) === scope).length,
            ),
          );
        }
        const scope = parts[0] as MemoryScopeFolder;
        if (!MEMORY_SCOPE_FOLDERS.includes(scope)) return [];
        if (parts.length === 1) {
          return MEMORY_KINDS.map((kind) =>
            directoryEntry(
              titleCase(kind),
              `${scope}/${kind}`,
              memories.filter(
                (memory) =>
                  scopeFolder(memory) === scope && memory.kind === kind,
              ).length,
            ),
          );
        }
        const kind = parts[1] as MemoryKind;
        if (parts.length !== 2 || !MEMORY_KINDS.includes(kind)) return [];
        return memories
          .filter(
            (memory) => scopeFolder(memory) === scope && memory.kind === kind,
          )
          .map((memory) => ({
            name: `${memory.content.title}.md`,
            path: memoryFilePath(memory),
            type: "file" as const,
            size: memory.content.body.length,
            sha: memory.currentRevisionId,
          }));
      },
      async readFile(path: string) {
        const id = memoryIdFromFilePath(path);
        if (!id) return null;
        const detail = await memoryApi.get(id);
        if (memoryFilePath(detail.memory) !== normalizedPath(path)) return null;
        const content = memoryMarkdown(detail.memory, detail.revisions);
        return {
          path,
          sha: detail.memory.currentRevisionId,
          size: content.length,
          content,
          base64Content: "",
          isBinary: false,
          encoding: "utf-8" as const,
        };
      },
    }),
    [memories, memoriesQuery.error, repositoryScope],
  );

  const memoryForPath = useCallback(
    (path: string | null) => {
      const id = path ? memoryIdFromFilePath(path) : null;
      return id ? (memories.find((memory) => memory.id === id) ?? null) : null;
    },
    [memories],
  );

  async function deleteMemory(memory: Readonly<Memory>) {
    if (
      !window.confirm(
        `Delete "${memory.content.title}" and its revision history?`,
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      await memoryApi.remove(memory.id);
      activePathRef.current = "";
      router.replace(`/repo/${repositoryScope}/memory`);
      void invalidate();
      toast.success("Memory deleted");
    } catch (error) {
      toast.error("Could not delete memory", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setDeleting(false);
    }
  }

  const memoryActions = ({
    selectedPath,
  }: {
    selectedPath: string | null;
    isFile: boolean;
  }) => {
    activePathRef.current = selectedPath ?? "";
    const selected = memoryForPath(selectedPath);
    return (
      <>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="New memory"
          aria-label="New memory"
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Search memory"
          aria-label="Search memory"
          onClick={() => setSearching(true)}
        >
          <Search className="h-4 w-4" />
        </Button>
        {selected ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Edit memory"
              aria-label="Edit memory"
              onClick={() => setEditing(selected)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Delete memory"
              aria-label="Delete memory"
              disabled={deleting}
              onClick={() => void deleteMemory(selected)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        ) : null}
      </>
    );
  };

  const routeToMemory = useCallback(
    (memory: Readonly<Memory>) => {
      const path = memoryFilePath(memory);
      activePathRef.current = path;
      router.replace(`/repo/${repositoryScope}/memory/${path}`);
    },
    [repositoryScope, router],
  );

  return (
    <AuthGuard>
      <FilesPage
        title="Memory"
        routeBase="/memory"
        initialPath={activePathRef.current}
        transport={transport}
        headerActions={memoryActions}
        showSearch={false}
        showUpload={false}
        defaultMarkdownViewMode="preview"
      />

      <MemoryFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(memory) => {
          setCreating(false);
          void invalidate();
          routeToMemory(memory);
        }}
      />
      <MemoryFormDialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        memory={editing}
        onSaved={(memory) => {
          setEditing(null);
          void invalidate();
          routeToMemory(memory);
        }}
      />
      <MemorySearchDialog
        open={searching}
        onOpenChange={setSearching}
        memories={memories}
        onSelect={routeToMemory}
      />
    </AuthGuard>
  );
}

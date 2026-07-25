"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  FilesPage,
  type FileEntry,
  type FilesTransport,
} from "@dashboard/features/file-manager";
import { memoryApi } from "../api/memory";
import { AuthGuard } from "../auth-guard";
import { useAuth } from "../auth-context";

function memoryIdFromPath(path: string): string {
  const clean = path.replace(/^\/+|\/+$/g, "");
  return clean.endsWith(".md") ? clean.slice(0, -3) : clean;
}

function memoryName(id: string): string {
  const words = id.replaceAll(/[-_]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : id;
}

export function MemoryFilesView({ initialPath = "" }: { initialPath?: string }) {
  const { auth } = useAuth();
  const queryClient = useQueryClient();
  const scope = `${auth?.owner ?? ""}/${auth?.repo ?? ""}`;
  const queryKey = useMemo(() => ["memory-files", scope] as const, [scope]);
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
  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey }),
    [queryClient, queryKey],
  );

  const transport = useMemo<FilesTransport>(
    () => ({
      cacheKey: `memory:${scope}:${memories.length}:${memories[0]?.updatedAt ?? ""}`,
      async listDir(path: string): Promise<FileEntry[]> {
        if (path.replace(/^\/+|\/+$/g, "")) return [];
        return memories.map((memory) => ({
          name: `${memory.id}.md`,
          path: `${memory.id}.md`,
          type: "file" as const,
          size: memory.body.length,
          sha: memory.sha,
        }));
      },
      async readFile(path: string) {
        const memory = await memoryApi.get(memoryIdFromPath(path));
        return {
          path,
          sha: memory.sha,
          size: memory.body.length,
          content: memory.body,
          base64Content: "",
          isBinary: false,
          encoding: "utf-8" as const,
        };
      },
      async writeFile(path: string, content: string) {
        const id = memoryIdFromPath(path);
        const body = content.trim() ? content : `# ${memoryName(id)}\n`;
        const existing = memories.find((memory) => memory.id === id);
        if (existing) {
          await memoryApi.update(id, { body });
        } else {
          const name = memoryName(id);
          await memoryApi.create({
            id,
            name,
            description: `Memory entry for ${name}.`,
            type: "project",
            body,
          });
        }
        await invalidate();
      },
      async deleteFile(path: string) {
        await memoryApi.remove(memoryIdFromPath(path));
        await invalidate();
      },
    }),
    [invalidate, memories, scope],
  );

  return (
    <AuthGuard>
      <FilesPage
        title="Memory"
        routeBase="/memory"
        initialPath={initialPath}
        transport={transport}
        newFileExtension=".md"
        newFilePlaceholder="Memory name"
        newFileNameOnly
        showSearch={false}
        showUpload={false}
        defaultMarkdownViewMode="edit"
      />
    </AuthGuard>
  );
}

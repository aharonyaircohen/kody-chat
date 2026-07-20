/**
 * @fileType component
 * @domain context
 * @pattern context-files-view
 * @ai-summary Context rendered through the generic file-manager workspace:
 *   a writeable transport maps context entries to markdown files, and the
 *   context extras (agent filter, audience assignment for the open entry)
 *   plug into the workspace header. Storage stays in the context API.
 */
"use client";

import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import { Button } from "@kody-ade/base/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@kody-ade/base/ui/dropdown-menu";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FilesPage,
  type FileEntry,
  type FilesTransport,
} from "@dashboard/features/file-manager";
import { AuthGuard } from "../auth-guard";
import { useAuth } from "../auth-context";
import { useAgents } from "../hooks/useAgents";
import { contextApi, type ContextEntry } from "../api/context";

function slugFromPath(path: string): string {
  const clean = path.replace(/^\/+|\/+$/g, "");
  return clean.endsWith(".md") ? clean.slice(0, -3) : clean;
}

export function ContextFilesView({
  initialPath = "",
}: {
  initialPath?: string;
}) {
  const { auth } = useAuth();
  const queryClient = useQueryClient();
  const { data: agents = [] } = useAgents();
  const [agentFilter, setAgentFilter] = useState<string | null>(null);

  const scope = `${auth?.owner ?? ""}/${auth?.repo ?? ""}`;
  const entriesQuery = useQuery({
    queryKey: ["context-files", scope],
    queryFn: () => contextApi.list(),
    enabled: Boolean(auth),
    staleTime: 30_000,
  });
  const entries = useMemo(
    () => entriesQuery.data ?? [],
    [entriesQuery.data],
  );
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["context-files", scope] });

  const transport = useMemo<FilesTransport>(() => {
    const visible = agentFilter
      ? entries.filter((entry) => entry.agent.includes(agentFilter))
      : entries;
    return {
      cacheKey: `context:${agentFilter ?? "all"}:${visible.length}:${
        visible[0]?.updatedAt ?? ""
      }`,
      async listDir(path: string): Promise<FileEntry[]> {
        if (path.replace(/^\/+|\/+$/g, "")) return [];
        return visible.map((entry) => ({
          name: `${entry.slug}.md`,
          path: `${entry.slug}.md`,
          type: "file" as const,
          size: entry.body.length,
          sha: entry.sha,
        }));
      },
      async readFile(path: string) {
        const entry = await contextApi.get(slugFromPath(path));
        return {
          path,
          sha: entry.sha,
          size: entry.body.length,
          content: entry.body,
          base64Content: "",
          isBinary: false,
          encoding: "utf-8" as const,
        };
      },
      async writeFile(path: string, content: string) {
        const slug = slugFromPath(path);
        // The context API rejects empty bodies — seed new/emptied entries
        // with a heading so "New file" works from the workspace.
        const body = content.trim() ? content : `# ${slug}\n`;
        const existing = entries.find((entry) => entry.slug === slug);
        if (existing) {
          await contextApi.update(slug, { body });
        } else {
          await contextApi.create({ slug, body, agent: ["kody"] });
        }
        await invalidate();
      },
      async deleteFile(path: string) {
        await contextApi.remove(slugFromPath(path));
        await invalidate();
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, agentFilter]);

  const updateAudience = async (entry: ContextEntry, agentSlug: string) => {
    const next = entry.agent.includes(agentSlug)
      ? entry.agent.filter((slug) => slug !== agentSlug)
      : [...entry.agent, agentSlug];
    if (next.length === 0) {
      toast.error("Keep at least one agent assigned");
      return;
    }
    try {
      await contextApi.update(entry.slug, { agent: next });
      await invalidate();
      toast.success(`Updated audience for ${entry.slug}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update audience",
      );
    }
  };

  const headerActions = ({
    selectedPath,
  }: {
    selectedPath: string | null;
    isFile: boolean;
  }) => {
    const entry = selectedPath
      ? (entries.find((item) => item.slug === slugFromPath(selectedPath)) ??
        null)
      : null;
    return (
      <>
        {entry ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                title={`Audience: ${entry.agent.join(", ")}`}
                aria-label="Assign agents"
              >
                <Users className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Read by</DropdownMenuLabel>
              {agents.map((agent) => (
                <DropdownMenuCheckboxItem
                  key={agent.slug}
                  checked={entry.agent.includes(agent.slug)}
                  onCheckedChange={() => void updateAudience(entry, agent.slug)}
                >
                  {agent.slug}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={agentFilter ? "secondary" : "ghost"}
              size="sm"
              title="Filter by agent"
            >
              {agentFilter ?? "All agents"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => setAgentFilter(null)}>
              All agents
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {agents.map((agent) => (
              <DropdownMenuItem
                key={agent.slug}
                onClick={() => setAgentFilter(agent.slug)}
              >
                {agent.slug}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    );
  };

  return (
    <AuthGuard>
      <FilesPage
        title="Context"
        routeBase="/context"
        initialPath={initialPath}
        transport={transport}
        headerActions={headerActions}
        newFileExtension=".md"
        newFilePlaceholder="Entry name"
        newFileNameOnly
        showSearch={false}
        showUpload={false}
        defaultMarkdownViewMode="edit"
      />
    </AuthGuard>
  );
}

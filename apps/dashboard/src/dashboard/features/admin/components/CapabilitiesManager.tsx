"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Folder, FolderOpen, Loader2, Play, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@kody-ade/base/ui/button";
import { Input } from "@kody-ade/base/ui/input";
import {
  kodyApi,
  type CapabilityDetail,
  type CapabilityWriteInput,
} from "@dashboard/lib/api";
import {
  useCapabilities,
  useRunCapability,
} from "@dashboard/lib/hooks/useCapabilities";
import { selectionPath } from "@dashboard/lib/selection-routing";
import { EmptyState } from "@dashboard/lib/components/EmptyState";
import { MasterDetailShell } from "@dashboard/lib/components/MasterDetailShell";
import {
  FilesPage,
  type FileEntry,
  type FilesTransport,
} from "@dashboard/features/file-manager";

export interface CapabilityQueryScope {
  owner?: string | null;
  repo?: string | null;
  resource?: "capabilities";
}

export const capabilityQueryKeys = {
  all: ["kody-capabilities"] as const,
  list: (scope: CapabilityQueryScope = {}) =>
    [
      "kody-capabilities",
      scope.resource ?? "capabilities",
      scope.owner ?? null,
      scope.repo ?? null,
    ] as const,
  detail: (slug: string | null, scope: CapabilityQueryScope = {}) =>
    [
      "kody-capability",
      scope.resource ?? "capabilities",
      scope.owner ?? null,
      scope.repo ?? null,
      slug,
    ] as const,
};

interface CapabilitiesManagerProps {
  selectedSlug?: string;
  basePath?: string;
}

export function CapabilitiesManager({
  selectedSlug,
  basePath = "/capabilities",
}: CapabilitiesManagerProps) {
  if (selectedSlug) {
    return (
      <CapabilityWorkspace
        slug={selectedSlug}
        basePath={basePath}
        initialPath={`${selectedSlug}/instructions.md`}
      />
    );
  }

  return <CapabilityList basePath={basePath} />;
}

function CapabilityList({ basePath }: { basePath: string }) {
  const router = useRouter();
  const list = useCapabilities();
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (list.data ?? []).filter(
      (item) =>
        !query ||
        item.slug.toLowerCase().includes(query) ||
        item.describe?.toLowerCase().includes(query),
    );
  }, [list.data, search]);

  return (
    <MasterDetailShell
      title="Capabilities"
      icon={FolderOpen}
      iconClassName="text-amber-400"
      subtitle={`${list.data?.length ?? 0} capability folders`}
      error={
        list.error ? `Failed to load capabilities: ${list.error.message}` : null
      }
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search capability folders..."
      searchAriaLabel="Search capability folders"
      accent="amber"
      hasSelection={false}
      actions={
        <Button
          size="sm"
          className="w-9 px-0"
          aria-label="New capability"
          onClick={() => router.push(`${basePath}/new`)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      }
      detail={
        <EmptyState
          icon={<Folder />}
          title="Open a capability folder"
          hint="Every folder contains instructions.md, contract.json, skills/, and tools/."
        />
      }
    >
      {list.isLoading ? (
        <EmptyState icon={<Folder />} title="Loading capabilities..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Folder />}
          title="No capabilities"
          hint="Create one small executable folder."
        />
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map((capability) => (
            <li key={capability.slug}>
              <button
                type="button"
                className="w-full px-4 py-3 text-left hover:bg-accent/50"
                onClick={() =>
                  router.push(selectionPath(basePath, capability.slug))
                }
              >
                <div className="flex items-center gap-2">
                  <Folder className="h-4 w-4 text-amber-400" />
                  <span className="font-mono text-sm">{capability.slug}/</span>
                </div>
                {capability.describe ? (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {capability.describe}
                  </p>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </MasterDetailShell>
  );
}

function capabilityFiles(detail: CapabilityDetail): Map<string, string> {
  const root = detail.slug;
  return new Map([
    [`${root}/instructions.md`, detail.instructions],
    [`${root}/contract.json`, JSON.stringify(detail.simpleContract, null, 2)],
    ...detail.skills.map(
      (skill) =>
        [
          `${root}/skills/${skill.name}`,
          skill.body ?? skill.content ?? "",
        ] as const,
    ),
    ...detail.capabilityTools.map(
      (tool) => [`${root}/tools/${tool.name}`, tool.content ?? ""] as const,
    ),
  ]);
}

function listCapabilityDirectory(
  detail: CapabilityDetail,
  directory: string,
): FileEntry[] {
  const normalized = directory.replace(/^\/+|\/+$/g, "");
  const prefix = normalized ? `${normalized}/` : "";
  const entries = new Map<string, FileEntry>();

  for (const [path, content] of capabilityFiles(detail)) {
    if (!path.startsWith(prefix)) continue;
    const remainder = path.slice(prefix.length);
    if (!remainder) continue;
    const [name, ...rest] = remainder.split("/");
    const childPath = prefix + name;
    const isDirectory = rest.length > 0;
    const current = entries.get(childPath);
    if (!current || isDirectory) {
      entries.set(childPath, {
        name,
        path: childPath,
        type: isDirectory ? "dir" : "file",
        size: isDirectory ? 0 : content.length,
        sha: `capability:${detail.slug}:${childPath}`,
      });
    }
  }

  if (normalized === detail.slug) {
    for (const name of ["skills", "tools"]) {
      const path = `${detail.slug}/${name}`;
      entries.set(path, {
        name,
        path,
        type: "dir",
        size: 0,
        sha: `capability:${detail.slug}:${path}`,
      });
    }
  }

  return [...entries.values()].sort((left, right) => {
    if (left.type !== right.type) return left.type === "dir" ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

function capabilityWriteInput(
  detail: CapabilityDetail,
  files: Map<string, string>,
): CapabilityWriteInput {
  const root = `${detail.slug}/`;
  const rawContract = files.get(`${root}contract.json`);
  if (!rawContract) throw new Error("contract.json is required");
  const contract = JSON.parse(
    rawContract,
  ) as CapabilityDetail["simpleContract"];
  if (
    !contract.input?.name ||
    !contract.input.schema ||
    !contract.output?.name ||
    !contract.output.schema
  ) {
    throw new Error("contract.json must contain one input and one output");
  }

  const assets = (folder: "skills" | "tools") =>
    [...files.entries()]
      .filter(([path]) => path.startsWith(`${root}${folder}/`))
      .map(([path, content]) => ({
        path: path.slice(`${root}${folder}/`.length),
        content,
      }));

  return {
    slug: detail.slug,
    instructions: files.get(`${root}instructions.md`) ?? "",
    inputName: contract.input.name,
    inputSchema: contract.input.schema,
    outputName: contract.output.name,
    outputSchema: contract.output.schema,
    skills: assets("skills"),
    tools: assets("tools"),
  };
}

function isCapabilityAssetPath(path: string, slug: string): boolean {
  const relative = path.startsWith(`${slug}/`)
    ? path.slice(slug.length + 1)
    : "";
  return (
    (relative.startsWith("skills/") || relative.startsWith("tools/")) &&
    !relative.endsWith("/") &&
    relative.split("/").every(Boolean)
  );
}

export function CapabilityWorkspace({
  slug,
  basePath = "/capabilities",
  initialPath = `${slug}/instructions.md`,
}: {
  slug: string;
  basePath?: string;
  initialPath?: string;
}) {
  const queryClient = useQueryClient();
  const run = useRunCapability();
  const detailQuery = useQuery({
    queryKey: capabilityQueryKeys.detail(slug),
    queryFn: () => kodyApi.capabilities.get(slug),
  });
  const detailRef = useRef<CapabilityDetail | null>(null);
  if (detailQuery.data) detailRef.current = detailQuery.data;

  const transport = useMemo<FilesTransport | undefined>(() => {
    const initial = detailQuery.data;
    if (!initial) return undefined;

    const saveFiles = async (files: Map<string, string>) => {
      const current = detailRef.current;
      if (!current) throw new Error("Capability is not loaded");
      const updated = await kodyApi.capabilities.update(
        slug,
        capabilityWriteInput(current, files),
      );
      detailRef.current = updated;
      queryClient.setQueryData(capabilityQueryKeys.detail(slug), updated);
      void queryClient.invalidateQueries({ queryKey: capabilityQueryKeys.all });
    };

    return {
      cacheKey: `capability:${slug}:${JSON.stringify(initial)}`,
      listDir: async (path) =>
        listCapabilityDirectory(detailRef.current ?? initial, path),
      readFile: async (path) => {
        const normalized = path.replace(/^\/+|\/+$/g, "");
        const content = capabilityFiles(detailRef.current ?? initial).get(
          normalized,
        );
        if (content === undefined) return null;
        return {
          path: normalized,
          sha: `capability:${slug}:${normalized}`,
          size: content.length,
          content,
          base64Content: "",
          isBinary: false,
          encoding: "utf-8",
        };
      },
      ...(initial.readOnly
        ? {}
        : {
            writeFile: async (path: string, content: string) => {
              const normalized = path.replace(/^\/+|\/+$/g, "");
              if (
                normalized !== `${slug}/instructions.md` &&
                normalized !== `${slug}/contract.json` &&
                !isCapabilityAssetPath(normalized, slug)
              ) {
                throw new Error(
                  "Capability files must be instructions.md, contract.json, or files under skills/ and tools/",
                );
              }
              const current = detailRef.current ?? initial;
              const files = capabilityFiles(current);
              files.set(normalized, content);
              await saveFiles(files);
            },
            deleteFile: async (path: string) => {
              const normalized = path.replace(/^\/+|\/+$/g, "");
              if (!isCapabilityAssetPath(normalized, slug)) {
                throw new Error(
                  "Only files inside skills/ and tools/ can be deleted",
                );
              }
              const current = detailRef.current ?? initial;
              const files = capabilityFiles(current);
              files.delete(normalized);
              await saveFiles(files);
            },
          }),
    };
  }, [detailQuery.data, queryClient, slug]);

  if (detailQuery.error) {
    return (
      <EmptyState
        icon={<Folder />}
        title="Could not open capability"
        hint={detailQuery.error.message}
      />
    );
  }
  if (detailQuery.isLoading || !transport) {
    return (
      <EmptyState icon={<Folder />} title="Loading capability folder..." />
    );
  }

  return (
    <FilesPage
      title={`${slug}/`}
      routeBase={`${basePath}/${slug}/files`}
      initialPath={initialPath}
      transport={transport}
      protectedPaths={[
        slug,
        `${slug}/instructions.md`,
        `${slug}/contract.json`,
        `${slug}/skills`,
        `${slug}/tools`,
      ]}
      showSearch={false}
      showUpload={false}
      headerActions={() => (
        <Button
          size="sm"
          onClick={() => run.mutate({ slug })}
          disabled={run.isPending}
        >
          {run.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Run as Kody
        </Button>
      )}
    />
  );
}

export function CapabilityEditorPage({
  slug,
  basePath = "/capabilities",
}: {
  slug: string | null;
  basePath?: string;
}) {
  if (slug) {
    return <CapabilityWorkspace slug={slug} basePath={basePath} />;
  }
  return <NewCapabilityFolder basePath={basePath} />;
}

function NewCapabilityFolder({ basePath }: { basePath: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: (slug: string) =>
      kodyApi.capabilities.create({
        slug,
        instructions: "# Instructions\n",
        inputName: "request",
        inputSchema: { type: "object" },
        outputName: "result",
        outputSchema: { type: "object" },
        skills: [],
        tools: [],
      }),
    onSuccess: (capability) => {
      void queryClient.invalidateQueries({ queryKey: capabilityQueryKeys.all });
      toast.success("Capability folder created");
      router.push(selectionPath(basePath, capability.slug));
    },
    onError: (error: Error) =>
      toast.error("Could not create capability", {
        description: error.message,
      }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(name.trim());
  };

  return (
    <form
      onSubmit={submit}
      className="mx-auto mt-16 max-w-md space-y-5 rounded-lg border border-border p-6"
    >
      <div>
        <h1 className="text-xl font-semibold">New capability folder</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Name the folder, then edit its contents in Files.
        </p>
      </div>
      <Input
        aria-label="Capability folder name"
        placeholder="capability-name"
        value={name}
        required
        pattern="[a-z0-9][a-z0-9_-]*"
        onChange={(event) => setName(event.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(basePath)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          Create folder
        </Button>
      </div>
    </form>
  );
}

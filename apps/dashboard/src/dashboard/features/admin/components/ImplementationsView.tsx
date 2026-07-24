"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Cpu,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@kody-ade/base/ui/badge";
import { Button } from "@kody-ade/base/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@kody-ade/base/ui/card";
import { Input } from "@kody-ade/base/ui/input";
import { Label } from "@kody-ade/base/ui/label";
import { Textarea } from "@kody-ade/base/ui/textarea";
import { EmptyState } from "@dashboard/lib/components/EmptyState";
import { ConfirmDialog } from "@dashboard/lib/components/ConfirmDialog";
import { MasterDetailShell } from "@dashboard/lib/components/MasterDetailShell";
import { buildAuthHeaders, useAuth } from "@dashboard/lib/auth-context";
import { selectionPath } from "@dashboard/lib/selection-routing";
import {
  CapabilityEditorForm,
  type CapabilityDetail,
  type SavePayload,
} from "@dashboard/features/admin/components/CapabilitiesManager";
import {
  appendContract,
  composeProfile,
  fieldsFromProfile,
} from "@dashboard/lib/capabilities/profile";

type ImplementationSummary = {
  id: string;
  capabilityId: string;
  compatibleCapabilityRevision: string;
  type: "agent" | "script";
  agentId?: string;
  htmlUrl: string;
  selected: boolean;
  selection: "repository" | "automatic" | "available";
};

type ImplementationDetail = ImplementationSummary & {
  definition: Record<string, unknown>;
  runtime: Record<string, unknown> | null;
  promptTemplate: string | null;
  files: string[];
  bundle: Record<string, string>;
  assets: {
    skills: string[];
    tools: string[];
    scripts: string[];
    hooks: string[];
    commands: string[];
    subagents: string[];
    plugins: string[];
    mcpServers: string[];
    cliTools: string[];
    inputMappings: string[];
    outputMappings: string[];
    requirements: string[];
  };
  capabilityContract: Record<string, unknown> | null;
  recentRuns: Array<{
    runId: string;
    status: string;
    updatedAt: string;
  }>;
  repositoryBinding: string | null;
};

type ImplementationWritePayload = {
  definition: {
    id: string;
    capabilityRef: { kind: "capability"; id: string };
    compatibleCapabilityRevision: string;
    type: "agent" | "script";
    agentRef?: { kind: "agent"; id: string };
  };
  runtime: Record<string, unknown> | null;
  promptTemplate: string | null;
  files?: Record<string, string>;
};

async function readJson<T>(
  url: string,
  headers: Record<string, string>,
): Promise<T> {
  const response = await fetch(url, { headers, cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(
      payload.message || payload.error || `HTTP ${response.status}`,
    );
  }
  return payload;
}

async function readAllImplementations(
  headers: Record<string, string>,
): Promise<ImplementationSummary[]> {
  const implementations: ImplementationSummary[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const page = await readJson<{
      implementations: ImplementationSummary[];
      nextCursor: string | null;
    }>(`/api/kody/implementations?${params}`, headers);
    implementations.push(...page.implementations);
    cursor = page.nextCursor;
  } while (cursor);
  return implementations;
}

export function ImplementationsView({
  selectedId,
}: {
  selectedId?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { auth } = useAuth();
  const headers = useMemo(() => buildAuthHeaders(auth), [auth]);
  const list = useQuery({
    queryKey: ["agency-implementations", auth?.owner, auth?.repo],
    queryFn: async () => readAllImplementations(headers),
    enabled: Boolean(auth),
    staleTime: 30_000,
  });
  const detail = useQuery({
    queryKey: [
      "agency-implementation",
      auth?.owner,
      auth?.repo,
      selectedId,
    ],
    queryFn: async () =>
      (
        await readJson<{ implementation: ImplementationDetail }>(
          `/api/kody/implementations/${encodeURIComponent(selectedId!)}`,
          headers,
        )
      ).implementation,
    enabled: Boolean(auth && selectedId),
    staleTime: 30_000,
  });
  const select = useMutation({
    mutationFn: async (implementation: ImplementationSummary) => {
      const response = await fetch("/api/kody/store-catalog/import", {
        method: "POST",
        headers,
        body: JSON.stringify({
          kind: "implementation",
          slug: implementation.id,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(
          payload.message || payload.error || `HTTP ${response.status}`,
        );
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["agency-implementations", auth?.owner, auth?.repo],
      });
      await queryClient.invalidateQueries({
        queryKey: ["agency-implementation", auth?.owner, auth?.repo],
      });
      toast.success("Implementation selected");
    },
    onError: (error) =>
      toast.error("Could not select Implementation", {
        description: error.message,
      }),
  });
  const save = useMutation({
    mutationFn: async (payload: ImplementationWritePayload) => {
      const id = payload.definition.id;
      const response = await fetch(
        editing === "new"
          ? "/api/kody/implementations"
          : `/api/kody/implementations/${encodeURIComponent(id)}`,
        {
          method: editing === "new" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify(payload),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || body.error || "Save failed");
      return id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({
        queryKey: ["agency-implementations", auth?.owner, auth?.repo],
      });
      await queryClient.invalidateQueries({
        queryKey: ["agency-implementation", auth?.owner, auth?.repo, id],
      });
      setEditing(null);
      router.push(selectionPath("/implementations", id));
      toast.success("Implementation saved");
    },
    onError: (error) => toast.error("Could not save Implementation", {
      description: error.message,
    }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(
        `/api/kody/implementations/${encodeURIComponent(id)}`,
        { method: "DELETE", headers },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || body.error || "Delete failed");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["agency-implementations", auth?.owner, auth?.repo],
      });
      setDeleting(null);
      router.push("/implementations");
      toast.success("Implementation deleted");
    },
    onError: (error) => toast.error("Could not delete Implementation", {
      description: error.message,
    }),
  });

  if (list.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (list.error) {
    return (
      <EmptyState
        icon={<RefreshCw className="h-5 w-5" />}
        title="Could not load Implementations"
        hint={list.error.message}
        action={<Button onClick={() => void list.refetch()}>Retry</Button>}
      />
    );
  }

  const implementations = list.data ?? [];
  const query = search.trim().toLowerCase();
  const visibleImplementations = query
    ? implementations.filter((implementation) =>
        [
          implementation.id,
          implementation.capabilityId,
          implementation.type,
          implementation.agentId ?? "",
        ].some((value) => value.toLowerCase().includes(query)),
      )
    : implementations;
  const selectedSummary =
    implementations.find((item) => item.id === selectedId) ?? null;

  return (
    <>
      <MasterDetailShell
        title="Implementations"
        icon={Cpu}
        iconClassName="text-emerald-400"
        subtitle={auth ? `${auth.owner}/${auth.repo}` : undefined}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search implementations…"
        searchAriaLabel="Search implementations"
        accent="emerald"
        hasSelection={Boolean(selectedId || editing)}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="w-9 px-0"
              aria-label="Refresh implementations"
              onClick={() => void list.refetch()}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              className="w-9 px-0"
              aria-label="New implementation"
              title="New implementation"
              onClick={() => setEditing("new")}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </>
        }
        detail={
          editing ? (
            <FullImplementationEditor
              implementation={editing === "new" ? null : detail.data ?? null}
              existingIds={new Set(implementations.map((item) => item.id))}
              headers={headers}
              saving={save.isPending}
              onCancel={() => setEditing(null)}
              onSave={(payload) => save.mutate(payload)}
            />
          ) : !selectedId ? (
            <EmptyState
              icon={<Cpu className="h-5 w-5" />}
              title="Select an Implementation"
              hint="Pick one from the list to see it, edit it, or delete it."
            />
          ) : detail.isLoading ? (
            <div className="flex min-h-[40vh] items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : detail.error || !detail.data ? (
            <EmptyState
              icon={<RefreshCw className="h-5 w-5" />}
              title="Could not load Implementation"
              hint={detail.error?.message ?? "Implementation not found"}
              action={<Button onClick={() => void detail.refetch()}>Retry</Button>}
            />
          ) : (
            <ImplementationDetailView
              implementation={detail.data}
              summary={selectedSummary}
              selecting={select.isPending}
              onSelect={() => selectedSummary && select.mutate(selectedSummary)}
              onEdit={() => setEditing(detail.data.id)}
              onDelete={() => setDeleting(detail.data.id)}
            />
          )
        }
      >
        {implementations.length === 0 ? (
          <EmptyState
            icon={<Cpu className="h-5 w-5" />}
            title="No Implementations"
            hint="Create the first technical execution model for a Capability."
            action={
              <Button size="sm" onClick={() => setEditing("new")}>
                <Plus className="mr-2 h-4 w-4" />
                New implementation
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border/60">
            {visibleImplementations.map((implementation) => (
              <li key={implementation.id}>
                <Button
                  type="button"
                  variant="ghost"
                  className={`h-auto w-full justify-start rounded-none px-4 py-4 text-left whitespace-normal hover:bg-muted/40 ${
                    selectedSummary?.id === implementation.id ? "bg-muted/60" : ""
                  }`}
                  onClick={() =>
                    router.push(selectionPath("/implementations", implementation.id))
                  }
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-sm font-medium">
                        {implementation.id}
                      </span>
                      {implementation.selected ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : null}
                    </div>
                    <p className="mt-2 truncate text-xs text-muted-foreground">
                      {implementation.type} · {implementation.capabilityId}
                    </p>
                  </div>
                </Button>
              </li>
            ))}
            {visibleImplementations.length === 0 ? (
              <EmptyState
                icon={<Cpu className="h-5 w-5" />}
                title="No matching Implementations"
              />
            ) : null}
          </ul>
        )}
      </MasterDetailShell>
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete implementation ${deleting}?`}
        description="This removes the whole Implementation package from the shared Store. Repositories using it may stop running."
        confirmLabel={remove.isPending ? "Deleting…" : "Delete"}
        variant="destructive"
        onConfirm={() => deleting && remove.mutate(deleting)}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

function ImplementationDetailView({
  implementation,
  summary,
  selecting,
  onSelect,
  onEdit,
  onDelete,
}: {
  implementation: ImplementationDetail;
  summary: ImplementationSummary | null;
  selecting: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-2xl font-semibold">
              {implementation.id}
            </h2>
            <Badge>{implementation.type}</Badge>
            {summary?.selected ? (
              <Badge variant="outline">{summary.selection}</Badge>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Implements{" "}
            <span className="font-mono">{implementation.capabilityId}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button variant="destructive" onClick={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
          {!summary?.selected ? (
            <Button onClick={onSelect} disabled={selecting || !summary}>
              {selecting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Select for repository
            </Button>
          ) : null}
          <Button variant="outline" asChild>
            <a
              href={implementation.htmlUrl}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Store source
            </a>
          </Button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <ValueCard title="Compatible Capability revision">
          <span className="break-all font-mono text-xs">
            {implementation.compatibleCapabilityRevision}
          </span>
        </ValueCard>
        <ValueCard title="Agent">
          {implementation.agentId ?? "Not used by this script Implementation"}
        </ValueCard>
      </div>

      <JsonCard
        title="Capability contract"
        value={implementation.capabilityContract}
      />
      <JsonCard title="Implementation definition" value={implementation.definition} />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Technical assets</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {(
            [
              ["Skills", implementation.assets.skills],
              ["Tools", implementation.assets.tools],
              ["Scripts", implementation.assets.scripts],
              ["Hooks", implementation.assets.hooks],
              ["Commands", implementation.assets.commands],
              ["Subagents", implementation.assets.subagents],
              ["Plugins", implementation.assets.plugins],
              ["MCP servers", implementation.assets.mcpServers],
              ["CLI tools", implementation.assets.cliTools],
              ["Input mappings", implementation.assets.inputMappings],
              ["Output mappings", implementation.assets.outputMappings],
              ["Requirements", implementation.assets.requirements],
            ] as const
          ).map(([label, values]) => (
            <div key={label}>
              <p className="text-xs font-medium text-muted-foreground">
                {label}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {values.length > 0 ? (
                  values.map((value) => (
                    <Badge key={value} variant="outline">
                      {value}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">None</span>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Prompt template</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-4 font-mono text-xs">
            {implementation.promptTemplate ?? "No prompt template"}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {implementation.recentRuns.length > 0 ? (
            <div className="divide-y divide-border/60">
              {implementation.recentRuns.map((run) => (
                <div
                  key={run.runId}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                >
                  <span className="font-mono text-xs">{run.runId}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{run.status}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(run.updatedAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No recorded Runs</p>
          )}
        </CardContent>
      </Card>

      <JsonCard title="Runtime configuration" value={implementation.runtime} />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Files</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {implementation.files.map((file) => (
            <Badge key={file} variant="outline">
              {file}
            </Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function FullImplementationEditor({
  implementation,
  existingIds,
  headers,
  saving,
  onCancel,
  onSave,
}: {
  implementation: ImplementationDetail | null;
  existingIds: Set<string>;
  headers: Record<string, string>;
  saving: boolean;
  onCancel: () => void;
  onSave: (payload: ImplementationWritePayload) => void;
}) {
  const [capabilityId, setCapabilityId] = useState(
    implementation?.capabilityId ?? "",
  );
  const [compatibleRevision, setCompatibleRevision] = useState(
    implementation?.compatibleCapabilityRevision ?? "",
  );
  const runtimeFields = implementation?.runtime
    ? fieldsFromProfile(implementation.id, implementation.runtime)
    : null;
  const bundle = implementation?.bundle ?? {};
  const skills = (runtimeFields?.skills ?? []).map((name) => ({
    name,
    body: bundle[`skills/${name}/SKILL.md`] ?? "",
  }));
  const shellScripts = (runtimeFields?.shellScripts ?? []).map((name) => ({
    name,
    content: bundle[name] ?? bundle[`scripts/${name}`] ?? "",
  }));
  const initial: CapabilityDetail | null = implementation
    ? {
        slug: implementation.id,
        describe: runtimeFields?.describe ?? implementation.capabilityId,
        landing: runtimeFields?.landing ?? "pr",
        updatedAt: null,
        htmlUrl: implementation.htmlUrl,
        agent: implementation.agentId ?? null,
        prompt: implementation.promptTemplate ?? "",
        model: runtimeFields?.model ?? "inherit",
        permissionMode: runtimeFields?.permissionMode ?? "acceptEdits",
        tools: runtimeFields?.tools ?? [],
        skills,
        shellScripts,
        mcpServers: runtimeFields?.mcpServers ?? [],
        profileJson: JSON.stringify(implementation.runtime ?? {}, null, 2),
      }
    : null;

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <Card className="mb-5">
        <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="implementation-capability">Capability</Label>
            <Input
              id="implementation-capability"
              value={capabilityId}
              onChange={(event) => setCapabilityId(event.target.value)}
              placeholder="release-watch"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="implementation-revision">Compatible revision</Label>
            <Input
              id="implementation-revision"
              value={compatibleRevision}
              onChange={(event) => setCompatibleRevision(event.target.value)}
              placeholder="revision-1"
            />
          </div>
        </CardContent>
      </Card>
      <CapabilityEditorForm
        isNew={!implementation}
        initial={initial}
        existingSlugs={existingIds}
        saving={saving}
        headers={headers}
        apiBase="/api/kody/capabilities"
        resourceName="implementation"
        onClose={onCancel}
        onSave={async (payload: SavePayload) => {
          if (!capabilityId.trim() || !compatibleRevision.trim()) {
            toast.error("Capability and compatible revision are required");
            return;
          }
          const runtime = composeProfile({
            slug: payload.slug,
            describe: payload.describe,
            prompt: payload.prompt,
            model: payload.model,
            permissionMode: payload.permissionMode,
            tools: payload.tools,
            skills: payload.skills.map((skill) => skill.name),
            shellScripts: payload.shellScripts.map((script) => script.name),
            mcpServers: payload.mcpServers,
            landing: payload.landing,
          });
          onSave({
            definition: {
              id: payload.slug,
              capabilityRef: { kind: "capability", id: capabilityId.trim() },
              compatibleCapabilityRevision: compatibleRevision.trim(),
              type: "agent",
              agentRef: {
                kind: "agent",
                id: implementation?.agentId ?? "kody",
              },
            },
            runtime,
            promptTemplate: appendContract(payload.prompt, payload.landing),
            files: {
              ...Object.fromEntries(
                payload.skills.map((skill) => [
                  `skills/${skill.name}/SKILL.md`,
                  skill.body,
                ]),
              ),
              ...Object.fromEntries(
                payload.shellScripts.map((script) => [
                  script.name,
                  script.content,
                ]),
              ),
            },
          });
        }}
      />
    </div>
  );
}

function LegacyImplementationEditor({
  implementation,
  saving,
  onCancel,
  onSave,
}: {
  implementation: ImplementationDetail | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (payload: ImplementationWritePayload) => void;
}) {
  const current = implementation?.definition ?? {};
  const currentCapability =
    current.capabilityRef && typeof current.capabilityRef === "object"
      ? (current.capabilityRef as { id?: unknown }).id
      : undefined;
  const currentAgent =
    current.agentRef && typeof current.agentRef === "object"
      ? (current.agentRef as { id?: unknown }).id
      : undefined;
  const [id, setId] = useState(implementation?.id ?? "");
  const [capabilityId, setCapabilityId] = useState(
    typeof currentCapability === "string"
      ? currentCapability
      : implementation?.capabilityId ?? "",
  );
  const [revision, setRevision] = useState(
    implementation?.compatibleCapabilityRevision ?? "",
  );
  const [type, setType] = useState<"agent" | "script">(
    implementation?.type ?? "agent",
  );
  const [agentId, setAgentId] = useState(
    typeof currentAgent === "string"
      ? currentAgent
      : implementation?.agentId ?? "",
  );
  const [prompt, setPrompt] = useState(implementation?.promptTemplate ?? "");
  const [runtime, setRuntime] = useState(
    JSON.stringify(implementation?.runtime ?? {}, null, 2),
  );
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^[a-z][a-z0-9-]{0,127}$/.test(id)) {
      setError("Use lowercase letters, numbers, and dashes; start with a letter.");
      return;
    }
    if (!capabilityId.trim() || !revision.trim()) {
      setError("Capability and compatible revision are required.");
      return;
    }
    if (type === "agent" && !agentId.trim()) {
      setError("Agent implementations require an Agent.");
      return;
    }
    let parsedRuntime: Record<string, unknown>;
    try {
      const value = JSON.parse(runtime);
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error();
      }
      parsedRuntime = value as Record<string, unknown>;
    } catch {
      setError("Runtime configuration must be a JSON object.");
      return;
    }
    setError(null);
    onSave({
      definition: {
        id,
        capabilityRef: { kind: "capability", id: capabilityId.trim() },
        compatibleCapabilityRevision: revision.trim(),
        type,
        ...(type === "agent"
          ? { agentRef: { kind: "agent" as const, id: agentId.trim() } }
          : {}),
      },
      runtime: parsedRuntime,
      promptTemplate: type === "agent" ? prompt : null,
    });
  };

  return (
    <form className="space-y-6" onSubmit={submit}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="icon" onClick={onCancel}>
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back</span>
          </Button>
          <div>
            <h2 className="text-2xl font-semibold">
              {implementation ? "Edit Implementation" : "New Implementation"}
            </h2>
            <p className="text-sm text-muted-foreground">
              Define how one Capability runs.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Implementation
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="grid gap-5 pt-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="implementation-id">ID</Label>
            <Input
              id="implementation-id"
              value={id}
              disabled={Boolean(implementation)}
              onChange={(event) => setId(event.target.value)}
              placeholder="release-watch-agent"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="implementation-capability">Capability</Label>
            <Input
              id="implementation-capability"
              value={capabilityId}
              onChange={(event) => setCapabilityId(event.target.value)}
              placeholder="release-watch"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="implementation-revision">Compatible revision</Label>
            <Input
              id="implementation-revision"
              value={revision}
              onChange={(event) => setRevision(event.target.value)}
              placeholder="revision-1"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="implementation-type">Type</Label>
            <select
              id="implementation-type"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={type}
              onChange={(event) =>
                setType(event.target.value as "agent" | "script")
              }
            >
              <option value="agent">Agent</option>
              <option value="script">Script</option>
            </select>
          </div>
          {type === "agent" ? (
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="implementation-agent">Agent</Label>
              <Input
                id="implementation-agent"
                value={agentId}
                onChange={(event) => setAgentId(event.target.value)}
                placeholder="kody"
              />
            </div>
          ) : null}
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="implementation-runtime">Runtime configuration</Label>
            <Textarea
              id="implementation-runtime"
              className="min-h-52 font-mono text-xs"
              value={runtime}
              onChange={(event) => setRuntime(event.target.value)}
            />
          </div>
          {type === "agent" ? (
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="implementation-prompt">Prompt template</Label>
              <Textarea
                id="implementation-prompt"
                className="min-h-40"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive md:col-span-2">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </form>
  );
}

function ValueCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  );
}

function JsonCard({
  title,
  value,
}: {
  title: string;
  value: Record<string, unknown> | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="max-h-96 overflow-auto rounded-lg bg-muted/50 p-4 font-mono text-xs">
          {value ? JSON.stringify(value, null, 2) : "Not configured"}
        </pre>
      </CardContent>
    </Card>
  );
}

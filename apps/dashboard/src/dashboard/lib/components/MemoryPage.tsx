"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Brain,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@kody-ade/base/ui/button";
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
import { Textarea } from "@kody-ade/base/ui/textarea";
import { EmptyState } from "./EmptyState";
import { MasterDetailShell } from "./MasterDetailShell";
import { AuthGuard } from "../auth-guard";
import {
  memoryApi,
  type CreateMemoryInput,
  type Memory,
  type MemoryKind,
} from "../api/memory";

const MEMORY_KEY = ["memories"] as const;
const KINDS: readonly MemoryKind[] = [
  "preference",
  "fact",
  "decision",
  "goal",
  "reference",
];

function selectedId(path: string): string | null {
  const clean = path.replace(/^\/+|\/+$/g, "");
  if (!clean) return null;
  return clean.endsWith(".md") ? clean.slice(0, -3) : clean;
}

export function MemoryPage({ initialPath = "" }: { initialPath?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const activeId = selectedId(initialPath);
  const repositoryMemoryPath =
    pathname.match(/^\/repo\/[^/]+\/[^/]+\/memory/)?.[0] ?? "/memory";
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Readonly<Memory> | null>(null);
  const memories = useQuery({
    queryKey: MEMORY_KEY,
    queryFn: memoryApi.list,
  });
  const detail = useQuery({
    queryKey: [...MEMORY_KEY, activeId],
    queryFn: () => memoryApi.get(activeId!),
    enabled: Boolean(activeId),
  });
  const remove = useMutation({
    mutationFn: memoryApi.remove,
    onSuccess: async (_result, memoryId) => {
      router.push(repositoryMemoryPath);
      await queryClient.cancelQueries({
        queryKey: [...MEMORY_KEY, memoryId],
        exact: true,
      });
      await queryClient.invalidateQueries({
        queryKey: MEMORY_KEY,
        exact: true,
      });
      toast.success("Memory deleted");
    },
    onError: (error: Error) =>
      toast.error("Could not delete memory", { description: error.message }),
  });
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (memories.data ?? []).filter((memory) => {
      const text = [
        memory.content.title,
        memory.content.summary,
        memory.content.body,
        memory.kind,
      ]
        .join(" ")
        .toLowerCase();
      return !query || text.includes(query);
    });
  }, [memories.data, search]);
  const selected = detail.data?.memory;

  return (
    <AuthGuard>
      <MasterDetailShell
        title="Memory"
        icon={Brain}
        iconClassName="text-violet-400"
        subtitle={`${memories.data?.length ?? 0} active memories`}
        error={
          memories.error instanceof Error ? memories.error.message : null
        }
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search memory..."
        searchAriaLabel="Search memory"
        accent="violet"
        hasSelection={Boolean(activeId)}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              aria-label="Refresh memory"
              disabled={memories.isFetching}
              onClick={() => void memories.refetch()}
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  memories.isFetching ? "animate-spin" : ""
                }`}
              />
            </Button>
            <Button
              size="sm"
              className="w-9 px-0"
              aria-label="New memory"
              onClick={() => setCreating(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </>
        }
        detail={
          selected ? (
            <MemoryDetail
              memory={selected}
              revisions={detail.data?.revisions ?? []}
              onBack={() => router.push(repositoryMemoryPath)}
              onEdit={() => setEditing(selected)}
              onDelete={() => {
                if (
                  window.confirm(
                    `Delete "${selected.content.title}" and its history?`,
                  )
                ) {
                  remove.mutate(selected.id);
                }
              }}
              deleting={remove.isPending}
            />
          ) : detail.isLoading ? (
            <EmptyState icon={<Brain />} title="Loading memory..." />
          ) : (
            <EmptyState
              icon={<Brain />}
              title={activeId ? "Memory not found" : "Select a memory"}
              hint="Review its current value, scope, evidence, and history."
            />
          )
        }
      >
        {memories.isLoading ? (
          <EmptyState icon={<Brain />} title="Loading memory..." />
        ) : filtered.length ? (
          <ul className="divide-y divide-border">
            {filtered.map((memory) => (
              <li key={memory.id}>
                <Button
                  type="button"
                  variant="ghost"
                  size="clear"
                  className="w-full px-4 py-3 text-left hover:bg-accent/50"
                  onClick={() =>
                    router.push(
                      `${repositoryMemoryPath}/${encodeURIComponent(memory.id)}`,
                    )
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {memory.content.title}
                    </span>
                    <span className="text-xs capitalize text-muted-foreground">
                      {memory.kind}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {memory.content.summary}
                  </p>
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<Brain />}
            title={search ? "No matching memories" : "No memories yet"}
            hint={search ? "Try another search." : "Create the first memory."}
          />
        )}
      </MasterDetailShell>

      <MemoryFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(memory) => {
          setCreating(false);
          void queryClient.invalidateQueries({ queryKey: MEMORY_KEY });
          router.push(
            `${repositoryMemoryPath}/${encodeURIComponent(memory.id)}`,
          );
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
          void queryClient.invalidateQueries({ queryKey: MEMORY_KEY });
          router.push(
            `${repositoryMemoryPath}/${encodeURIComponent(memory.id)}`,
          );
        }}
      />
    </AuthGuard>
  );
}

function MemoryDetail({
  memory,
  revisions,
  onBack,
  onEdit,
  onDelete,
  deleting,
}: {
  memory: Readonly<Memory>;
  revisions: readonly { id: string; reason: string; createdAt: string }[];
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const scope =
    memory.scope.kind === "user" ? "Personal" : memory.scope.tenantId;
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="mb-3 md:hidden"
            onClick={onBack}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Memory
          </Button>
          <p className="text-xs uppercase tracking-wide text-violet-400">
            {memory.kind} · {scope}
          </p>
          <h2 className="mt-1 text-2xl font-semibold">
            {memory.content.title}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {memory.content.summary}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={deleting}
            onClick={onDelete}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>
      <div className="whitespace-pre-wrap rounded-lg border border-border bg-card p-5 text-sm leading-6">
        {memory.content.body}
      </div>
      <section>
        <h3 className="mb-3 text-sm font-medium">
          History ({revisions.length})
        </h3>
        <ol className="space-y-2">
          {[...revisions].reverse().map((revision) => (
            <li
              key={revision.id}
              className="rounded-md border border-border px-3 py-2"
            >
              <p className="text-sm">{revision.reason}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(revision.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function MemoryFormDialog({
  open,
  onOpenChange,
  onSaved,
  memory = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (memory: Readonly<Memory>) => void;
  memory?: Readonly<Memory> | null;
}) {
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input: CreateMemoryInput = {
      scope: form.get("scope") as "user" | "repository",
      kind: form.get("kind") as MemoryKind,
      title: String(form.get("title") ?? ""),
      summary: String(form.get("summary") ?? ""),
      body: String(form.get("body") ?? ""),
      reason: String(form.get("reason") ?? "") || undefined,
    };
    setSaving(true);
    try {
      const saved = memory
        ? await memoryApi.update(memory.id, {
            kind: input.kind,
            title: input.title,
            summary: input.summary,
            body: input.body,
            reason: input.reason,
          })
        : await memoryApi.create(input);
      toast.success(memory ? "Memory updated" : "Memory created");
      onSaved(saved);
    } catch (error) {
      toast.error("Could not save memory", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{memory ? "Edit memory" : "New memory"}</DialogTitle>
          <DialogDescription>
            Store one clear fact, preference, decision, goal, or reference.
          </DialogDescription>
        </DialogHeader>
        <form key={memory?.currentRevisionId ?? "new"} onSubmit={submit}>
          <div className="space-y-4">
            {!memory ? (
              <Field label="Scope" htmlFor="memory-scope">
                <Select name="scope" defaultValue="user">
                  <SelectTrigger id="memory-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Personal</SelectItem>
                    <SelectItem value="repository">Repository</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <Input
                type="hidden"
                name="scope"
                value={memory.scope.kind}
              />
            )}
            <Field label="Kind" htmlFor="memory-kind">
              <Select name="kind" defaultValue={memory?.kind ?? "fact"}>
                <SelectTrigger id="memory-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      <span className="capitalize">{kind}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Title" htmlFor="memory-title">
              <Input
                id="memory-title"
                name="title"
                required
                maxLength={120}
                defaultValue={memory?.content.title}
              />
            </Field>
            <Field label="Summary" htmlFor="memory-summary">
              <Input
                id="memory-summary"
                name="summary"
                required
                maxLength={500}
                defaultValue={memory?.content.summary}
              />
            </Field>
            <Field label="Details" htmlFor="memory-body">
              <Textarea
                id="memory-body"
                name="body"
                required
                rows={7}
                maxLength={20_000}
                defaultValue={memory?.content.body}
              />
            </Field>
            <Field label="Reason" htmlFor="memory-reason">
              <Input
                id="memory-reason"
                name="reason"
                maxLength={500}
                placeholder="Why should Kody keep this?"
              />
            </Field>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

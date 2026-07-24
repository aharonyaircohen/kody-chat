"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
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
import { buildHeaders, handleResponse } from "@dashboard/lib/api";
import { EmptyState } from "@dashboard/lib/components/EmptyState";
import { MasterDetailShell } from "@dashboard/lib/components/MasterDetailShell";
import { selectionPath } from "@dashboard/lib/selection-routing";

interface Loop {
  id: string;
  trigger:
    | { type: "manual" }
    | { type: "schedule"; every: string }
    | { type: "event" | "webhook"; event: string }
    | { type: "condition"; expression: string };
  target: { kind: "workflow" | "capability"; id: string };
  input: Record<string, unknown>;
  enabled: boolean;
  updatedAt: string;
}

const LOOP_KEY = ["agency-loops"] as const;

export function LoopsPage({
  selectedId = null,
  basePath = "/agent-loops",
}: {
  selectedId?: string | null;
  basePath?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const loops = useQuery({
    queryKey: LOOP_KEY,
    queryFn: async () =>
      (
        await handleResponse<{ loops: Loop[] }>(
          await fetch("/api/kody/loops", {
            headers: buildHeaders(),
            cache: "no-store",
          }),
        )
      ).loops,
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      handleResponse(
        await fetch(`/api/kody/loops/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: buildHeaders(),
        }),
      ),
    onSuccess: () => {
      router.push(basePath);
      void queryClient.invalidateQueries({ queryKey: LOOP_KEY });
      toast.success("Loop deleted");
    },
    onError: (error: Error) =>
      toast.error("Could not delete loop", { description: error.message }),
  });
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (loops.data ?? []).filter(
      (loop) =>
        !query ||
        loop.id.toLowerCase().includes(query) ||
        loop.target.id.toLowerCase().includes(query) ||
        triggerLabel(loop.trigger).toLowerCase().includes(query),
    );
  }, [loops.data, search]);
  const selected = (loops.data ?? []).find((loop) => loop.id === selectedId);

  return (
    <>
      <MasterDetailShell
        title="Loops"
        icon={History}
        iconClassName="text-emerald-400"
        subtitle={`${loops.data?.length ?? 0} recurring triggers`}
        error={loops.error instanceof Error ? loops.error.message : null}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search loops..."
        searchAriaLabel="Search loops"
        accent="emerald"
        hasSelection={!!selected}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              aria-label="Refresh loops"
              disabled={loops.isFetching}
              onClick={() => void loops.refetch()}
            >
              <RefreshCw
                className={`h-4 w-4 ${loops.isFetching ? "animate-spin" : ""}`}
              />
            </Button>
            <Button
              size="sm"
              className="w-9 px-0"
              aria-label="New loop"
              onClick={() => setCreating(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </>
        }
        detail={
          selected ? (
            <LoopDetail
              loop={selected}
              onBack={() => router.push(basePath)}
              onDelete={() => remove.mutate(selected.id)}
              deleting={remove.isPending}
            />
          ) : (
            <EmptyState
              icon={<History />}
              title="Select a loop"
              hint="See what triggers it and which workflow or capability it starts."
            />
          )
        }
      >
        {loops.isLoading ? (
          <EmptyState icon={<History />} title="Loading loops..." />
        ) : filtered.length ? (
          <ul className="divide-y divide-border">
            {filtered.map((loop) => (
              <li key={loop.id}>
                <button
                  type="button"
                  className="w-full px-4 py-3 text-left transition-colors hover:bg-accent/50"
                  onClick={() => router.push(selectionPath(basePath, loop.id))}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-sm font-medium">
                      {loop.id}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {loop.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {triggerLabel(loop.trigger)} → {loop.target.id}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<History />}
            title={search ? "No matching loops" : "No loops yet"}
            hint={
              search ? "Try another search." : "Create one recurring trigger."
            }
          />
        )}
      </MasterDetailShell>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>New loop</DialogTitle>
            <DialogDescription>
              Choose when it runs and what it starts.
            </DialogDescription>
          </DialogHeader>
          <LoopForm
            onSaved={(id) => {
              setCreating(false);
              void queryClient.invalidateQueries({ queryKey: LOOP_KEY });
              router.push(selectionPath(basePath, id));
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function LoopDetail({
  loop,
  onBack,
  onDelete,
  deleting,
}: {
  loop: Loop;
  onBack: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <article className="mx-auto max-w-4xl space-y-7 p-5 md:p-8">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 md:hidden"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to loops
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-mono text-xl font-semibold">{loop.id}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {loop.enabled ? "Enabled" : "Disabled"}
            </p>
          </div>
        </div>
      </div>

      <dl className="grid gap-6 border-y border-border py-6 sm:grid-cols-2">
        <Detail label="Trigger" value={triggerLabel(loop.trigger)} />
        <Detail
          label="Target"
          value={`${loop.target.kind}/${loop.target.id}`}
        />
        <Detail label="Input" value={JSON.stringify(loop.input)} mono />
        <Detail
          label="Updated"
          value={new Date(loop.updatedAt).toLocaleString()}
        />
      </dl>

      <div className="flex justify-end border-t border-border pt-6">
        <Button
          variant="destructive"
          size="sm"
          disabled={deleting}
          onClick={onDelete}
        >
          {deleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          Delete loop
        </Button>
      </div>
    </article>
  );
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={`mt-1 text-sm ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function LoopForm({ onSaved }: { onSaved: (id: string) => void }) {
  const [id, setId] = useState("");
  const [every, setEvery] = useState("1d");
  const [targetKind, setTargetKind] = useState<"workflow" | "capability">(
    "workflow",
  );
  const [targetId, setTargetId] = useState("");
  const [input, setInput] = useState("{}");
  const create = useMutation({
    mutationFn: async () =>
      handleResponse(
        await fetch("/api/kody/loops", {
          method: "POST",
          headers: buildHeaders(),
          body: JSON.stringify({
            id,
            trigger: { type: "schedule", every },
            target: { kind: targetKind, id: targetId },
            input: JSON.parse(input),
            enabled: true,
          }),
        }),
      ),
    onSuccess: () => {
      toast.success("Loop created");
      onSaved(id);
    },
    onError: (error: Error) =>
      toast.error("Could not create loop", { description: error.message }),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      JSON.parse(input);
      create.mutate();
    } catch {
      toast.error("Loop input must be valid JSON.");
    }
  };
  return (
    <form onSubmit={submit} className="grid gap-4 pt-2 sm:grid-cols-2">
      <Field label="Loop id" value={id} onChange={setId} />
      <Field label="Every" value={every} onChange={setEvery} />
      <label className="space-y-2">
        <Label htmlFor="loop-target-kind">Target type</Label>
        <select
          id="loop-target-kind"
          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
          value={targetKind}
          onChange={(event) =>
            setTargetKind(event.target.value as "workflow" | "capability")
          }
        >
          <option value="workflow">Workflow</option>
          <option value="capability">Capability</option>
        </select>
      </label>
      <Field label="Target id" value={targetId} onChange={setTargetId} />
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="loop-input">Input</Label>
        <Input
          id="loop-input"
          className="font-mono"
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
      </div>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          Create loop
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = label.toLowerCase().replaceAll(" ", "-");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function triggerLabel(trigger: Loop["trigger"]) {
  if (trigger.type === "schedule") return `Every ${trigger.every}`;
  if (trigger.type === "event" || trigger.type === "webhook")
    return trigger.event;
  if (trigger.type === "condition") return trigger.expression;
  return "Manual";
}

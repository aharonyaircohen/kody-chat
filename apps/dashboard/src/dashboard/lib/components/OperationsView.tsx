/** @fileType component @domain agency-operations @pattern operations-view */
"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  Edit3,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { Badge } from "@kody-ade/base/ui/badge";
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
import { Textarea } from "@kody-ade/base/ui/textarea";
import type {
  OperationCatalog,
  OperationStatus,
} from "@kody-ade/agency/operations";
import type { OperationCreateInput, OperationRecord } from "../api/operations";
import {
  useCreateOperation,
  useDeleteOperation,
  useOperations,
  useRunOperation,
  useUpdateOperation,
} from "../hooks/useOperations";

type FormState = {
  id: string;
  name: string;
  responsibility: string;
  doesNotOwn: string;
  intentIds: string[];
  goals: string[];
  loops: string[];
};

const EMPTY_FORM: FormState = {
  id: "",
  name: "",
  responsibility: "",
  doesNotOwn: "",
  intentIds: [],
  goals: [],
  loops: [],
};

export function OperationsView() {
  const { data, error, isLoading, isFetching, refetch } = useOperations();
  const createOperation = useCreateOperation();
  const updateOperation = useUpdateOperation();
  const deleteOperation = useDeleteOperation();
  const runOperation = useRunOperation();
  const [editing, setEditing] = useState<OperationRecord | "create" | null>(
    null,
  );
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<OperationRecord | null>(
    null,
  );
  const operations = useMemo(() => data?.operations ?? [], [data]);
  const catalog = data?.catalog ?? { intents: [], goals: [], loops: [] };

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditing("create");
  }

  function openEdit(record: OperationRecord) {
    const operation = record.operation;
    setForm({
      id: operation.id,
      name: operation.name,
      responsibility: operation.responsibility,
      doesNotOwn: operation.doesNotOwn.join("\n"),
      intentIds: operation.intentIds,
      goals: operation.goals,
      loops: operation.loops,
    });
    setEditing(record);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const input: OperationCreateInput = {
      ...(form.id.trim() ? { id: form.id.trim() } : {}),
      name: form.name.trim(),
      responsibility: form.responsibility.trim(),
      doesNotOwn: form.doesNotOwn
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
      intentIds: form.intentIds,
      goals: form.goals,
      loops: form.loops,
    };
    try {
      if (editing === "create") await createOperation.mutateAsync(input);
      else if (editing)
        await updateOperation.mutateAsync({ id: editing.id, data: input });
      setEditing(null);
    } catch {
      // Mutation hooks show the actionable error and keep the form open.
    }
  }

  function setStatus(record: OperationRecord, status: OperationStatus) {
    updateOperation.mutate({ id: record.id, data: { status } });
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Operations</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Durable responsibility boundaries between Intent and owned Goals or
            Loops.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={
                isFetching ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"
              }
            />
            Refresh
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> New Operation
          </Button>
        </div>
      </header>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      ) : null}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Operations…
        </div>
      ) : null}
      {!isLoading && operations.length === 0 ? (
        <section className="rounded-xl border border-dashed p-8 text-center">
          <h2 className="font-medium">No Operations yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create one responsibility boundary; Goals and Loops stay reusable.
          </p>
          <Button className="mt-4" size="sm" onClick={openCreate}>
            Create Operation
          </Button>
        </section>
      ) : null}

      <section
        className="grid gap-4 md:grid-cols-2"
        aria-label="Operation list"
      >
        {operations.map((record) => {
          const operation = record.operation;
          const ready = record.activationIssues.length === 0;
          return (
            <article
              key={record.id}
              className="rounded-xl border bg-card p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{operation.name}</h2>
                    <Badge variant="outline">{operation.status}</Badge>
                    <Badge variant={ready ? "default" : "secondary"}>
                      {operation.status === "active" && ready
                        ? "scope valid"
                        : ready
                          ? "ready"
                          : "needs setup"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm">{operation.responsibility}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit Operation ${record.id}`}
                  onClick={() => openEdit(record)}
                  disabled={operation.status === "retired"}
                >
                  <Edit3 className="h-4 w-4" />
                </Button>
              </div>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <Boundary label="Does not own" values={operation.doesNotOwn} />
                <Boundary label="Intents" values={operation.intentIds} />
                <Boundary label="Goals" values={operation.goals} />
                <Boundary label="Loops" values={operation.loops} />
              </dl>
              {record.activationIssues.length > 0 ? (
                <ul
                  className="mt-4 list-disc pl-5 text-sm text-amber-600"
                  aria-label="Activation issues"
                >
                  {record.activationIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-2">
                {operation.status === "active" ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() => runOperation.mutate(record.id)}
                      disabled={runOperation.isPending}
                      aria-label={`Run Operation ${record.id}`}
                    >
                      <Play className="mr-2 h-4 w-4" />
                      Run now
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setStatus(record, "paused")}
                    >
                      <Pause className="mr-2 h-4 w-4" />
                      Pause
                    </Button>
                  </>
                ) : operation.status !== "retired" ? (
                  <Button
                    size="sm"
                    onClick={() => setStatus(record, "active")}
                    disabled={!ready || updateOperation.isPending}
                    aria-label={`Activate Operation ${record.id}`}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Activate
                  </Button>
                ) : null}
                {operation.status !== "retired" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStatus(record, "retired")}
                  >
                    Retire
                  </Button>
                ) : null}
                {operation.status !== "active" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setDeleteTarget(record)}
                    aria-label={`Delete Operation ${record.id}`}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>

      <OperationDialog
        open={editing !== null}
        mode={editing === "create" ? "create" : "edit"}
        form={form}
        catalog={catalog}
        pending={createOperation.isPending || updateOperation.isPending}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onFormChange={setForm}
        onSubmit={submit}
      />

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Operation?</DialogTitle>
            <DialogDescription>
              This removes the Operation contract, not its Goals or Loops.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!deleteTarget) return;
                try {
                  await deleteOperation.mutateAsync(deleteTarget.id);
                  setDeleteTarget(null);
                } catch {
                  // Mutation hook reports the error and keeps confirmation open.
                }
              }}
            >
              Delete Operation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Boundary({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1">{values.length ? values.join(", ") : "None"}</dd>
    </div>
  );
}

function OperationDialog({
  open,
  mode,
  form,
  catalog,
  pending,
  onOpenChange,
  onFormChange,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  form: FormState;
  catalog: OperationCatalog;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onFormChange: (form: FormState) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New Operation" : "Edit Operation"}
          </DialogTitle>
          <DialogDescription>
            Define the responsibility boundary and link existing agency work.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-5" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="operation-name">Name</Label>
            <Input
              id="operation-name"
              value={form.name}
              onChange={(event) =>
                onFormChange({ ...form, name: event.target.value })
              }
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="operation-id">ID (optional)</Label>
            <Input
              id="operation-id"
              value={form.id}
              onChange={(event) =>
                onFormChange({ ...form, id: event.target.value })
              }
              disabled={mode === "edit"}
              placeholder="generated-from-name"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="operation-responsibility">Responsibility</Label>
            <Textarea
              id="operation-responsibility"
              value={form.responsibility}
              onChange={(event) =>
                onFormChange({ ...form, responsibility: event.target.value })
              }
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="operation-exclusions">
              Does not own (one per line)
            </Label>
            <Textarea
              id="operation-exclusions"
              value={form.doesNotOwn}
              onChange={(event) =>
                onFormChange({ ...form, doesNotOwn: event.target.value })
              }
              required
            />
          </div>
          <ReferencePicker
            label="Intents"
            required
            options={catalog.intents}
            selected={form.intentIds}
            onChange={(intentIds) => onFormChange({ ...form, intentIds })}
          />
          <ReferencePicker
            label="Goals"
            options={catalog.goals}
            selected={form.goals}
            onChange={(goals) => onFormChange({ ...form, goals })}
          />
          <ReferencePicker
            label="Loops"
            options={catalog.loops}
            selected={form.loops}
            onChange={(loops) => onFormChange({ ...form, loops })}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending || form.intentIds.length === 0}
            >
              {pending
                ? "Saving…"
                : mode === "create"
                  ? "Create Operation"
                  : "Save Operation"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReferencePicker({
  label,
  options,
  selected,
  required = false,
  onChange,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  required?: boolean;
  onChange: (values: string[]) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">
        {label}
        {required ? " (required)" : ""}
      </legend>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No available {label.toLowerCase()}.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const checked = selected.includes(option);
            return (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                {/* eslint-disable-next-line react/forbid-elements -- native checkbox; kit Input styling isn't a drop-in */}
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange(
                      checked
                        ? selected.filter((item) => item !== option)
                        : [...selected, option],
                    )
                  }
                />
                {option}
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

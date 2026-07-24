"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@kody-ade/base/ui/button";
import { Input } from "@kody-ade/base/ui/input";
import { PageShell } from "@dashboard/lib/components/PageShell";
import {
  useCreateTodo,
  useDeleteTodo,
  useTodoEntries,
  useUpdateTodo,
} from "@dashboard/lib/hooks/useTodoEntries";
import { useRepoScopedHref } from "@dashboard/lib/hooks/useRepoScopedHref";
import type {
  TodoChecklistItem,
  TodoEntry,
  TodoStatus,
  TodoWrite,
} from "@dashboard/lib/api/todos";

interface TodoControlProps {
  embedded?: boolean;
  selectedSlug?: string | null;
  selectedItemId?: string | null;
}

function blank(): TodoWrite {
  return {
    title: "",
    outcome: "",
    status: "todo",
    evidence: [],
    checklist: [],
    blockers: [],
    runIds: [],
  };
}

function editable(todo: TodoEntry): TodoWrite {
  return {
    title: todo.title,
    outcome: todo.outcome,
    status: todo.status,
    evidence: todo.evidence,
    checklist: todo.checklist,
    blockers: todo.blockers,
    runIds: todo.runIds,
  };
}

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function LinesEditor({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-medium uppercase tracking-wide text-white/45">
        {label}
      </span>
      <textarea
        className="min-h-24 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
        value={values.join("\n")}
        onChange={(event) => onChange(lines(event.target.value))}
        placeholder={placeholder}
      />
    </label>
  );
}

function ChecklistEditor({
  items,
  onChange,
}: {
  items: TodoChecklistItem[];
  onChange: (items: TodoChecklistItem[]) => void;
}) {
  const [nextText, setNextText] = useState("");
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium uppercase tracking-wide text-white/45">
        Checklist
      </span>
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={item.done}
            onChange={(event) =>
              onChange(
                items.map((candidate) =>
                  candidate.id === item.id
                    ? { ...candidate, done: event.target.checked }
                    : candidate,
                ),
              )
            }
          />
          <Input
            value={item.text}
            onChange={(event) =>
              onChange(
                items.map((candidate) =>
                  candidate.id === item.id
                    ? { ...candidate, text: event.target.value }
                    : candidate,
                ),
              )
            }
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() =>
              onChange(items.filter((candidate) => candidate.id !== item.id))
            }
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input
          value={nextText}
          onChange={(event) => setNextText(event.target.value)}
          placeholder="Add a finite check"
          onKeyDown={(event) => {
            if (event.key !== "Enter" || !nextText.trim()) return;
            event.preventDefault();
            onChange([
              ...items,
              { id: crypto.randomUUID(), text: nextText.trim(), done: false },
            ]);
            setNextText("");
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!nextText.trim()}
          onClick={() => {
            onChange([
              ...items,
              { id: crypto.randomUUID(), text: nextText.trim(), done: false },
            ]);
            setNextText("");
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add
        </Button>
      </div>
    </div>
  );
}

export function TodoControl({
  embedded = false,
  selectedSlug = null,
}: TodoControlProps) {
  const router = useRouter();
  const href = useRepoScopedHref();
  const query = useTodoEntries();
  const createTodo = useCreateTodo();
  const deleteTodo = useDeleteTodo();
  const selected = useMemo(
    () => query.data?.find((todo) => todo.slug === selectedSlug) ?? null,
    [query.data, selectedSlug],
  );
  const [draft, setDraft] = useState<TodoWrite>(blank);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setDraft(selected ? editable(selected) : blank());
    setCreating(false);
  }, [selected]);

  const updateTodo = useUpdateTodo(selected?.slug ?? "");
  const content = (
    <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
        <Button
          className="mb-3 w-full"
          onClick={() => {
            setCreating(true);
            setDraft(blank());
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          New Todo
        </Button>
        {query.isLoading ? (
          <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin" />
        ) : (
          <div className="space-y-1">
            {(query.data ?? []).map((todo) => (
              <button
                key={todo.slug}
                className={`w-full rounded-xl px-3 py-2 text-left ${
                  selected?.slug === todo.slug
                    ? "bg-cyan-500/15 text-cyan-100"
                    : "text-white/65 hover:bg-white/5"
                }`}
                onClick={() => router.push(href(`/todos/${todo.slug}`))}
              >
                <div className="truncate text-sm font-medium">{todo.title}</div>
                <div className="mt-1 text-xs text-white/40">{todo.status}</div>
              </button>
            ))}
          </div>
        )}
      </aside>

      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        {!selected && !creating ? (
          <div className="flex min-h-72 flex-col items-center justify-center text-center text-white/45">
            <CheckCircle2 className="mb-3 h-8 w-8" />
            Select a Todo or create one.
          </div>
        ) : (
          <form
            className="space-y-5"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!draft.title.trim()) return;
              if (creating) {
                const created = await createTodo.mutateAsync(draft);
                router.push(href(`/todos/${created.slug}`));
              } else if (selected) {
                await updateTodo.mutateAsync(draft);
              }
            }}
          >
            <div className="flex gap-3">
              <Input
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="Todo title"
              />
              <select
                className="rounded-xl border border-white/10 bg-black/30 px-3 text-sm"
                value={draft.status}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    status: event.target.value as TodoStatus,
                  }))
                }
              >
                <option value="todo">Todo</option>
                <option value="in-progress">In progress</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done</option>
              </select>
            </div>

            <label className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-wide text-white/45">
                Outcome
              </span>
              <textarea
                className="min-h-28 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                value={draft.outcome}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    outcome: event.target.value,
                  }))
                }
                placeholder="What finite result means this Todo is done?"
              />
            </label>

            <ChecklistEditor
              items={draft.checklist}
              onChange={(checklist) =>
                setDraft((current) => ({ ...current, checklist }))
              }
            />
            <LinesEditor
              label="Evidence"
              values={draft.evidence}
              onChange={(evidence) =>
                setDraft((current) => ({ ...current, evidence }))
              }
              placeholder="One proof item per line"
            />
            <LinesEditor
              label="Blockers"
              values={draft.blockers}
              onChange={(blockers) =>
                setDraft((current) => ({ ...current, blockers }))
              }
              placeholder="One blocker per line"
            />
            <LinesEditor
              label="Related Runs"
              values={draft.runIds}
              onChange={(runIds) =>
                setDraft((current) => ({ ...current, runIds }))
              }
              placeholder="One run id per line"
            />

            <div className="flex justify-between">
              {selected ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={async () => {
                    await deleteTodo.mutateAsync(selected.slug);
                    router.push(href("/todos"));
                  }}
                >
                  Delete
                </Button>
              ) : (
                <span />
              )}
              <Button
                type="submit"
                disabled={
                  !draft.title.trim() ||
                  createTodo.isPending ||
                  updateTodo.isPending
                }
              >
                {creating ? "Create Todo" : "Save Todo"}
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );

  return embedded ? (
    content
  ) : (
    <PageShell
      title="Todos"
      subtitle="Finite work: outcome, status, evidence, checklist, blockers, and related Runs."
    >
      {content}
    </PageShell>
  );
}

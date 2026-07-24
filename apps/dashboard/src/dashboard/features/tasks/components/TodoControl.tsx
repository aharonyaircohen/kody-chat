"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  ListTodo,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { Button } from "@kody-ade/base/ui/button";
import { Checkbox } from "@kody-ade/base/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@kody-ade/base/ui/dialog";
import { Input } from "@kody-ade/base/ui/input";
import { ConfirmDialog } from "@dashboard/lib/components/ConfirmDialog";
import { EmptyState } from "@dashboard/lib/components/EmptyState";
import { MasterDetailShell } from "@dashboard/lib/components/MasterDetailShell";
import {
  useCreateTodo,
  useDeleteTodo,
  useTodoEntries,
  useUpdateTodo,
} from "@dashboard/lib/hooks/useTodoEntries";
import { useRepoScopedHref } from "@dashboard/lib/hooks/useRepoScopedHref";
import { cn } from "@dashboard/lib/utils";
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

type EditorState =
  { mode: "create"; todo: null } | { mode: "edit"; todo: TodoEntry } | null;

const STATUS_LABELS: Record<TodoStatus, string> = {
  todo: "Todo",
  "in-progress": "In progress",
  blocked: "Blocked",
  done: "Done",
};

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
    evidence: [...todo.evidence],
    checklist: todo.checklist.map((item) => ({ ...item })),
    blockers: [...todo.blockers],
    runIds: [...todo.runIds],
  };
}

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function statusClass(status: TodoStatus): string {
  if (status === "done")
    return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (status === "blocked")
    return "border-red-400/25 bg-red-400/10 text-red-200";
  if (status === "in-progress")
    return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  return "border-white/10 bg-white/[0.04] text-white/55";
}

function TodoListRows({
  todos,
  selectedSlug,
  isLoading,
  onSelect,
}: {
  todos: TodoEntry[];
  selectedSlug: string | null;
  isLoading: boolean;
  onSelect: (slug: string) => void;
}) {
  if (isLoading) {
    return (
      <EmptyState
        icon={<Loader2 className="animate-spin" />}
        title="Loading Todos..."
      />
    );
  }
  if (todos.length === 0) {
    return (
      <EmptyState
        icon={<ListTodo />}
        title="No matching Todos"
        hint="Create a Todo or try another search."
      />
    );
  }
  return (
    <ul className="divide-y divide-border">
      {todos.map((todo) => {
        const selected = todo.slug === selectedSlug;
        const done = todo.checklist.filter((item) => item.done).length;
        return (
          <li key={todo.slug}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onSelect(todo.slug)}
              className={cn(
                "relative h-auto w-full justify-start whitespace-normal rounded-none px-4 py-3 text-left transition-colors hover:bg-accent/50",
                selected && "bg-accent/70",
              )}
            >
              {selected ? (
                <span className="absolute inset-y-0 left-0 w-0.5 bg-emerald-400" />
              ) : null}
              <div className="flex min-w-0 items-start gap-2.5">
                {todo.status === "done" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-white/35" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white/85">
                    {todo.title}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/40">
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 text-[10px]",
                        statusClass(todo.status),
                      )}
                    >
                      {STATUS_LABELS[todo.status]}
                    </span>
                    <span>
                      {done}/{todo.checklist.length} checks
                    </span>
                  </div>
                </div>
              </div>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

function ChecklistItemCard({
  item,
  selected,
  onSelect,
  onToggle,
}: {
  item: TodoChecklistItem;
  selected: boolean;
  onSelect: () => void;
  onToggle: (done: boolean) => void;
}) {
  return (
    <li
      data-checklist-item-id={item.id}
      className={cn(
        "rounded-lg border bg-white/[0.025] transition-colors",
        selected
          ? "border-emerald-400/45 bg-emerald-400/[0.06]"
          : "border-white/[0.08]",
      )}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <Checkbox
          checked={item.done}
          onCheckedChange={(checked) => onToggle(checked === true)}
          aria-label={`Mark ${item.text} ${item.done ? "not done" : "done"}`}
          className="mt-0.5"
        />
        <Button
          type="button"
          variant="ghost"
          onClick={onSelect}
          className={cn(
            "-m-2 h-auto min-w-0 flex-1 justify-start whitespace-normal p-2 text-left text-sm leading-5 hover:bg-transparent",
            item.done ? "text-white/40 line-through" : "text-white/80",
          )}
        >
          {item.text}
        </Button>
      </div>
    </li>
  );
}

function DetailSection({ title, values }: { title: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-white/40">
        {title}
      </h3>
      <ul className="space-y-2 text-sm text-white/70">
        {values.map((value, index) => (
          <li
            key={`${title}-${index}`}
            className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2"
          >
            {value}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TodoDetail({
  todo,
  selectedItemId,
  onBack,
  onSelectItem,
}: {
  todo: TodoEntry;
  selectedItemId: string | null;
  onBack: () => void;
  onSelectItem: (itemId: string) => void;
}) {
  const updateTodo = useUpdateTodo(todo.slug);
  const selectedItemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedItemId) return;
    const node = Array.from(
      selectedItemRef.current?.querySelectorAll<HTMLElement>(
        "[data-checklist-item-id]",
      ) ?? [],
    ).find((candidate) => candidate.dataset.checklistItemId === selectedItemId);
    node?.scrollIntoView({ block: "center" });
  }, [selectedItemId, todo.slug]);

  const toggleItem = (itemId: string, done: boolean) => {
    updateTodo.mutate({
      checklist: todo.checklist.map((item) =>
        item.id === itemId ? { ...item, done } : item,
      ),
    });
  };

  return (
    <div
      ref={selectedItemRef}
      className="mx-auto max-w-4xl px-4 py-5 md:px-8 md:py-8"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="-ml-2 mb-4 md:hidden"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        All Todos
      </Button>

      <div className="mb-7 flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "rounded border px-2 py-1 text-xs",
            statusClass(todo.status),
          )}
        >
          {STATUS_LABELS[todo.status]}
        </span>
        <span className="text-xs text-white/35">
          Updated {new Date(todo.updatedAt).toLocaleDateString()}
        </span>
      </div>

      <section className="mb-8">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-white/40">
          Outcome
        </h2>
        <p className="whitespace-pre-wrap text-base leading-7 text-white/80">
          {todo.outcome || "No outcome defined."}
        </p>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wide text-white/40">
            Checklist
          </h2>
          <span className="text-xs text-white/35">
            {todo.checklist.filter((item) => item.done).length}/
            {todo.checklist.length} done
          </span>
        </div>
        {todo.checklist.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/35">
            No checks yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {todo.checklist.map((item) => (
              <ChecklistItemCard
                key={item.id}
                item={item}
                selected={selectedItemId === item.id}
                onSelect={() => onSelectItem(item.id)}
                onToggle={(done) => toggleItem(item.id, done)}
              />
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-7 md:grid-cols-2">
        <DetailSection title="Evidence" values={todo.evidence} />
        <DetailSection title="Blockers" values={todo.blockers} />
        <DetailSection title="Related Runs" values={todo.runIds} />
      </div>
    </div>
  );
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
    <label className="block space-y-2">
      <span className="text-xs font-medium uppercase tracking-wide text-white/45">
        {label}
      </span>
      <textarea
        className="min-h-20 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/50"
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
  const addItem = () => {
    if (!nextText.trim()) return;
    onChange([
      ...items,
      { id: crypto.randomUUID(), text: nextText.trim(), done: false },
    ]);
    setNextText("");
  };
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium uppercase tracking-wide text-white/45">
        Checklist
      </span>
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          <Checkbox
            checked={item.done}
            onCheckedChange={(checked) =>
              onChange(
                items.map((candidate) =>
                  candidate.id === item.id
                    ? { ...candidate, done: checked === true }
                    : candidate,
                ),
              )
            }
            aria-label={`Mark ${item.text} done`}
          />
          <Input
            value={item.text}
            aria-label="Checklist item"
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
            aria-label={`Remove ${item.text}`}
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
            if (event.key !== "Enter") return;
            event.preventDefault();
            addItem();
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!nextText.trim()}
          onClick={addItem}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add
        </Button>
      </div>
    </div>
  );
}

function TodoEditorDialog({
  state,
  onClose,
  onSaved,
}: {
  state: Exclude<EditorState, null>;
  onClose: () => void;
  onSaved: (todo: TodoEntry) => void;
}) {
  const [draft, setDraft] = useState<TodoWrite>(() =>
    state.todo ? editable(state.todo) : blank(),
  );
  const createTodo = useCreateTodo();
  const updateTodo = useUpdateTodo(state.todo?.slug ?? "");
  const pending = createTodo.isPending || updateTodo.isPending;

  useEffect(() => {
    setDraft(state.todo ? editable(state.todo) : blank());
  }, [state]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {state.mode === "create" ? "New Todo" : "Edit Todo"}
          </DialogTitle>
          <DialogDescription>
            Define one finite result and the checks that prove it is complete.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!draft.title.trim()) return;
            const saved =
              state.mode === "create"
                ? await createTodo.mutateAsync(draft)
                : await updateTodo.mutateAsync(draft);
            onSaved(saved);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
            <label className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-wide text-white/45">
                Title
              </span>
              <Input
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="Todo title"
                autoFocus
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-wide text-white/45">
                Status
              </span>
              <select
                className="h-9 w-full rounded-md border border-white/10 bg-black/30 px-3 text-sm"
                value={draft.status}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    status: event.target.value as TodoStatus,
                  }))
                }
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-2">
            <span className="text-xs font-medium uppercase tracking-wide text-white/45">
              Outcome
            </span>
            <textarea
              className="min-h-24 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/50"
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

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!draft.title.trim() || pending}>
              {pending
                ? "Saving..."
                : state.mode === "create"
                  ? "Create Todo"
                  : "Save Todo"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TodoControl({
  embedded = false,
  selectedSlug = null,
  selectedItemId = null,
}: TodoControlProps) {
  const router = useRouter();
  const href = useRepoScopedHref();
  const query = useTodoEntries();
  const deleteTodo = useDeleteTodo();
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<EditorState>(null);
  const [pendingDelete, setPendingDelete] = useState<TodoEntry | null>(null);
  const selected = useMemo(
    () => query.data?.find((todo) => todo.slug === selectedSlug) ?? null,
    [query.data, selectedSlug],
  );
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return query.data ?? [];
    return (query.data ?? []).filter(
      (todo) =>
        todo.title.toLowerCase().includes(term) ||
        todo.outcome.toLowerCase().includes(term) ||
        todo.status.toLowerCase().includes(term),
    );
  }, [query.data, search]);
  const headerTitle = selected?.title ?? "Todos";
  const totalOpen = (query.data ?? []).filter(
    (todo) => todo.status !== "done",
  ).length;

  const selectTodo = (slug: string) => router.push(href(`/todos/${slug}`));
  const selectItem = (itemId: string) => {
    if (!selected) return;
    router.push(href(`/todos/${selected.slug}/${itemId}`), { scroll: false });
  };
  const closeDetail = () => router.push(href("/todos"));

  const actions = (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Refresh todos"
        title="Refresh todos"
        onClick={() => query.refetch()}
        disabled={query.isFetching}
      >
        <RefreshCw
          className={cn("h-4 w-4", query.isFetching && "animate-spin")}
        />
      </Button>
      {selected ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Edit todo"
            title="Edit todo"
            onClick={() => setEditor({ mode: "edit", todo: selected })}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Delete todo"
            title="Delete todo"
            className="text-red-400 hover:text-red-300"
            onClick={() => setPendingDelete(selected)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      ) : null}
      <Button
        type="button"
        size="icon"
        aria-label="New todo"
        title="New todo"
        onClick={() => setEditor({ mode: "create", todo: null })}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </>
  );

  const rows = (
    <TodoListRows
      todos={filtered}
      selectedSlug={selectedSlug}
      isLoading={query.isLoading}
      onSelect={selectTodo}
    />
  );
  const detail = selected ? (
    <TodoDetail
      todo={selected}
      selectedItemId={selectedItemId}
      onBack={closeDetail}
      onSelectItem={selectItem}
    />
  ) : (
    <EmptyState
      icon={<ListTodo />}
      title="Select a Todo"
      hint="Choose a Todo to see its outcome, checklist, and evidence."
    />
  );

  return (
    <>
      {embedded ? (
        <div className="flex h-full min-h-0 flex-col bg-black/95 text-white/90">
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
            <span className="mr-auto min-w-0 truncate text-sm font-medium">
              {headerTitle}
            </span>
            {actions}
          </div>
          <div className="grid min-h-0 flex-1 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside
              className={cn(
                "min-h-0 overflow-y-auto border-r border-border",
                selected && "hidden lg:block",
              )}
            >
              <div className="border-b border-border p-3">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search Todos..."
                  aria-label="Search Todos"
                />
              </div>
              {rows}
            </aside>
            <section
              className={cn(
                "min-h-0 overflow-y-auto",
                !selected && "hidden lg:block",
              )}
            >
              {detail}
            </section>
          </div>
        </div>
      ) : (
        <MasterDetailShell
          title={headerTitle}
          icon={ListTodo}
          iconClassName="text-emerald-400"
          subtitle={`${totalOpen} open · ${(query.data ?? []).length} total`}
          actions={actions}
          error={
            query.error ? `Failed to load Todos: ${query.error.message}` : null
          }
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search Todos..."
          searchAriaLabel="Search Todos"
          accent="emerald"
          listWidth="md:w-80"
          hasSelection={Boolean(selected)}
          detail={detail}
        >
          {rows}
        </MasterDetailShell>
      )}

      {editor ? (
        <TodoEditorDialog
          state={editor}
          onClose={() => setEditor(null)}
          onSaved={(todo) => {
            setEditor(null);
            router.push(href(`/todos/${todo.slug}`));
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete Todo?"
        description={
          pendingDelete
            ? `"${pendingDelete.title}" and its checklist will be removed.`
            : ""
        }
        confirmLabel="Delete Todo"
        variant="destructive"
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteTodo.mutate(pendingDelete.slug, {
            onSuccess: closeDetail,
          });
        }}
      />
    </>
  );
}

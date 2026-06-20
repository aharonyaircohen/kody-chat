/**
 * @fileType component
 * @domain kody
 * @pattern managed-goals
 * @ai-summary Full managed-goals page backed by engine goal state files.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Route,
  ShieldAlert,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";

import { Badge } from "@dashboard/ui/badge";
import { Button } from "@dashboard/ui/button";
import { Card, CardContent } from "@dashboard/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@dashboard/ui/dialog";
import { Input } from "@dashboard/ui/input";
import { Label } from "@dashboard/ui/label";
import { Textarea } from "@dashboard/ui/textarea";

import { useAuth } from "../auth-context";
import {
  useCreateManagedGoal,
  useManagedGoals,
} from "../hooks/useManagedGoals";
import type {
  CreateManagedGoalInput,
  ManagedGoalRecord,
} from "../managed-goals";
import { cn } from "../utils";
import { EmptyState } from "./EmptyState";
import { MasterDetailShell } from "./MasterDetailShell";

interface EvidenceRow {
  id: string;
  evidence: string;
  stage: string;
  duty: string;
  executable: string;
}

const newRowId = () =>
  globalThis.crypto?.randomUUID?.() ?? `row-${Date.now()}-${Math.random()}`;

const blankRow = (): EvidenceRow => ({
  id: newRowId(),
  evidence: "",
  stage: "",
  duty: "",
  executable: "",
});

const templateRows = {
  simple: [
    {
      id: newRowId(),
      evidence: "goalVerified",
      stage: "verify",
      duty: "research",
      executable: "research",
    },
  ],
  docs: [
    {
      id: newRowId(),
      evidence: "docsChecked",
      stage: "docs-health",
      duty: "docs-health",
      executable: "docs-health",
    },
  ],
  plan: [
    {
      id: newRowId(),
      evidence: "planReady",
      stage: "plan",
      duty: "plan",
      executable: "plan",
    },
  ],
} satisfies Record<string, EvidenceRow[]>;

function cloneRows(rows: EvidenceRow[]): EvidenceRow[] {
  return rows.map((row) => ({ ...row, id: newRowId() }));
}

function stateClasses(state: string): string {
  if (state === "inactive") {
    return "border-white/10 bg-white/[0.04] text-white/55";
  }
  if (state === "done") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }
  if (state === "paused") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }
  return "border-sky-500/30 bg-sky-500/10 text-sky-200";
}

function completedEvidence(goal: ManagedGoalRecord): number {
  return goal.state.destination.evidence.filter(
    (key) => goal.state.facts[key] === true,
  ).length;
}

function nextEvidence(goal: ManagedGoalRecord): string | null {
  return (
    goal.state.destination.evidence.find(
      (key) => goal.state.facts[key] !== true,
    ) ?? null
  );
}

function currentRouteStep(goal: ManagedGoalRecord) {
  const next = nextEvidence(goal);
  return next ? goal.state.route.find((step) => step.evidence === next) : null;
}

function goalSearchText(goal: ManagedGoalRecord): string {
  return [
    goal.id,
    goal.source ?? "",
    goal.recordType ?? "",
    goal.state.type,
    goal.state.state,
    goal.state.stage ?? "",
    goal.state.destination.outcome,
    ...goal.state.destination.evidence,
    ...goal.state.duties,
    ...goal.state.route.flatMap((step) => [
      step.stage,
      step.evidence,
      step.duty,
      step.executable ?? "",
    ]),
    ...goal.state.blockers,
  ]
    .join(" ")
    .toLowerCase();
}

function NewGoalDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { auth } = useAuth();
  const createGoal = useCreateManagedGoal(auth?.user.login);
  const [goalId, setGoalId] = useState("");
  const [type, setType] = useState("general");
  const [outcome, setOutcome] = useState("");
  const [rows, setRows] = useState<EvidenceRow[]>(
    cloneRows(templateRows.simple),
  );

  const validRows = useMemo(
    () =>
      rows.filter(
        (row) => row.evidence.trim() && row.stage.trim() && row.duty.trim(),
      ),
    [rows],
  );
  const duties = useMemo(
    () => Array.from(new Set(validRows.map((row) => row.duty.trim()))),
    [validRows],
  );
  const canSubmit = outcome.trim().length > 0 && validRows.length > 0;

  const reset = () => {
    setGoalId("");
    setType("general");
    setOutcome("");
    setRows(cloneRows(templateRows.simple));
  };

  const applyTemplate = (
    nextType: string,
    nextOutcome: string,
    nextRows: EvidenceRow[],
  ) => {
    setType(nextType);
    if (!outcome.trim()) setOutcome(nextOutcome);
    setRows(cloneRows(nextRows));
  };

  const updateRow = (id: string, patch: Partial<Omit<EvidenceRow, "id">>) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  const removeRow = (id: string) => {
    setRows((prev) =>
      prev.length === 1 ? prev : prev.filter((row) => row.id !== id),
    );
  };

  const submit = async () => {
    const payload: CreateManagedGoalInput = {
      ...(goalId.trim() ? { id: goalId.trim() } : {}),
      type: type.trim() || "general",
      outcome: outcome.trim(),
      evidence: validRows.map((row) => row.evidence.trim()),
      route: validRows.map((row) => ({
        stage: row.stage.trim(),
        evidence: row.evidence.trim(),
        duty: row.duty.trim(),
        ...(row.executable.trim() ? { executable: row.executable.trim() } : {}),
      })),
    };
    await createGoal.mutateAsync(payload);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>New goal</DialogTitle>
          <DialogDescription>
            Name the finish line, then list the proof Kody needs.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-5">
            <section className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 space-y-4">
              <div className="flex items-start gap-2">
                <Target className="mt-0.5 h-4 w-4 text-sky-300" />
                <div>
                  <h3 className="text-sm font-medium text-white/90">Goal</h3>
                  <p className="text-xs text-muted-foreground">
                    The outcome this repo should reach.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                <div className="space-y-2">
                  <Label htmlFor="goal-id">Name</Label>
                  <Input
                    id="goal-id"
                    value={goalId}
                    onChange={(event) => setGoalId(event.target.value)}
                    placeholder="verify-goals-page"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Used as the goal file name. Leave empty to auto-name it.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goal-type">Kind</Label>
                  <Input
                    id="goal-type"
                    value={type}
                    onChange={(event) => setType(event.target.value)}
                    placeholder="release"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="goal-outcome">Finish line</Label>
                <Textarea
                  id="goal-outcome"
                  value={outcome}
                  onChange={(event) => setOutcome(event.target.value)}
                  placeholder="The Goals page can create and show a managed goal."
                  className="min-h-24"
                />
              </div>
            </section>

            <section className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" />
                  <div>
                    <h3 className="text-sm font-medium text-white/90">
                      Proof steps
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Each row says what proof is needed and who should get it.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRows((prev) => [...prev, blankRow()])}
                >
                  <Plus className="h-4 w-4" />
                  Add proof
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <TemplateButton
                  label="Simple check"
                  onClick={() =>
                    applyTemplate(
                      "test",
                      "Verify the Goals page can create and show a managed goal.",
                      templateRows.simple,
                    )
                  }
                />
                <TemplateButton
                  label="Docs check"
                  onClick={() =>
                    applyTemplate(
                      "docs",
                      "Documentation is checked and any drift is reported.",
                      templateRows.docs,
                    )
                  }
                />
                <TemplateButton
                  label="Planning"
                  onClick={() =>
                    applyTemplate(
                      "plan",
                      "A plan exists for the requested work.",
                      templateRows.plan,
                    )
                  }
                />
              </div>

              <div className="space-y-3">
                {rows.map((row, index) => (
                  <div
                    key={row.id}
                    className="rounded-lg border border-white/[0.08] bg-black/20 p-3 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Proof {index + 1}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRow(row.id)}
                        disabled={rows.length === 1}
                        aria-label="Remove proof"
                        className="h-7 w-7 px-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`evidence-${row.id}`}>Proof key</Label>
                        <Input
                          id={`evidence-${row.id}`}
                          value={row.evidence}
                          onChange={(event) =>
                            updateRow(row.id, { evidence: event.target.value })
                          }
                          placeholder="qaPassed"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`stage-${row.id}`}>Stage</Label>
                        <Input
                          id={`stage-${row.id}`}
                          value={row.stage}
                          onChange={(event) =>
                            updateRow(row.id, { stage: event.target.value })
                          }
                          placeholder="qa"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`duty-${row.id}`}>Duty</Label>
                        <Input
                          id={`duty-${row.id}`}
                          value={row.duty}
                          onChange={(event) =>
                            updateRow(row.id, { duty: event.target.value })
                          }
                          placeholder="qa-goal"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`executable-${row.id}`}>
                          Executable
                        </Label>
                        <Input
                          id={`executable-${row.id}`}
                          value={row.executable}
                          onChange={(event) =>
                            updateRow(row.id, {
                              executable: event.target.value,
                            })
                          }
                          placeholder="qa-goal"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-3">
            <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.05] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-sky-100">
                <Sparkles className="h-4 w-4" />
                Goal preview
              </div>
              <dl className="space-y-3 text-sm">
                <PreviewLine label="State" value="active" />
                <PreviewLine label="Kind" value={type || "general"} />
                <PreviewLine
                  label="Proof"
                  value={`${validRows.length} item${
                    validRows.length === 1 ? "" : "s"
                  }`}
                />
                <PreviewLine
                  label="Duties"
                  value={duties.length ? duties.join(", ") : "none"}
                />
              </dl>
            </div>

            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
              <div className="mb-2 text-sm font-medium text-white/85">
                Created file
              </div>
              <p className="break-words font-mono text-xs text-white/55">
                .kody/goals/{goalId.trim() || "auto-name"}/state.json
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void submit()}
                disabled={!canSubmit || createGoal.isPending}
              >
                {createGoal.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Create
              </Button>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TemplateButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      {label}
    </Button>
  );
}

function PreviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-white/80">{value}</dd>
    </div>
  );
}

function GoalRow({
  goal,
  isActive,
  onSelect,
}: {
  goal: ManagedGoalRecord;
  isActive: boolean;
  onSelect: () => void;
}) {
  const done = completedEvidence(goal);
  const total = goal.state.destination.evidence.length;
  const step = currentRouteStep(goal);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors relative",
        isActive && "bg-accent/70",
      )}
    >
      {isActive ? (
        <span className="absolute inset-y-0 left-0 w-0.5 bg-sky-400" />
      ) : null}

      <div className="flex items-center gap-2">
        <Target
          className={cn(
            "w-3.5 h-3.5 shrink-0",
            isActive ? "text-sky-400" : "text-muted-foreground",
          )}
        />
        <span className="font-mono text-sm truncate flex-1 text-white/90">
          {goal.id}
        </span>
        <Badge
          className={cn("shrink-0 border", stateClasses(goal.state.state))}
        >
          {goal.state.state}
        </Badge>
        {goal.source === "store" ? (
          <Badge className="shrink-0 border border-violet-500/30 bg-violet-500/10 text-violet-200">
            Store
          </Badge>
        ) : null}
      </div>

      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
        <span>{goal.state.type}</span>
        <span>·</span>
        <span>
          {done}/{total} evidence
        </span>
        {step ? (
          <>
            <span>·</span>
            <span>{step.stage}</span>
          </>
        ) : null}
      </div>

      <p className="text-xs text-white/55 mt-1 truncate">
        {goal.state.destination.outcome}
      </p>
    </button>
  );
}

function GoalDetail({
  goal,
  onBack,
}: {
  goal: ManagedGoalRecord;
  onBack: () => void;
}) {
  const done = completedEvidence(goal);
  const total = goal.state.destination.evidence.length;
  const step = currentRouteStep(goal);

  return (
    <article className="min-h-full">
      <div className="border-b border-white/[0.06] bg-gradient-to-b from-sky-500/[0.06] via-sky-500/[0.02] to-transparent">
        <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="md:hidden gap-1 -ml-2 text-muted-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            All goals
          </Button>

          <header className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1 space-y-2">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight break-words font-mono inline-flex items-center gap-3 flex-wrap">
                <span>{goal.id}</span>
                <Badge className={cn("border", stateClasses(goal.state.state))}>
                  {goal.state.state}
                </Badge>
                {goal.source === "store" ? (
                  <span className="text-[11px] font-sans uppercase tracking-wide bg-violet-500/10 text-violet-200 border border-violet-500/30 px-2 py-0.5 rounded">
                    Store template
                  </span>
                ) : null}
                <span className="text-[11px] font-sans uppercase tracking-wide bg-white/[0.06] text-white/50 px-2 py-0.5 rounded">
                  {goal.state.type}
                </span>
              </h1>
              <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {done}/{total} evidence
                </span>
                {goal.state.stage ? (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Route className="w-3 h-3" />
                      {goal.state.stage}
                    </span>
                  </>
                ) : null}
                <span>·</span>
                <span className="font-mono opacity-80">{goal.path}</span>
              </div>
            </div>
          </header>

          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 md:p-5">
            <p className="text-sm text-white/80">
              {goal.state.destination.outcome}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <ContentSection
          icon={CheckCircle2}
          title="Evidence"
          subtitle="What proves this goal is done"
          count={goal.state.destination.evidence.length}
        >
          <div className="space-y-2">
            {goal.state.destination.evidence.map((key) => {
              const complete = goal.state.facts[key] === true;
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-md border border-white/[0.08] bg-black/20 px-3 py-2 text-sm"
                >
                  <span className="font-mono text-white/75">{key}</span>
                  <span
                    className={cn(
                      "text-xs",
                      complete ? "text-emerald-300" : "text-white/40",
                    )}
                  >
                    {complete ? "done" : "open"}
                  </span>
                </div>
              );
            })}
          </div>
        </ContentSection>

        <ContentSection
          icon={Route}
          title="Route"
          subtitle="Duties and executables used to collect evidence"
          count={goal.state.route.length}
        >
          <div className="space-y-2">
            {goal.state.route.map((routeStep) => (
              <Card
                key={`${routeStep.stage}:${routeStep.evidence}`}
                className={cn(
                  "border-white/[0.08] bg-white/[0.02]",
                  step?.evidence === routeStep.evidence &&
                    "border-sky-500/30 bg-sky-500/[0.05]",
                )}
              >
                <CardContent className="p-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-white/85">
                      {routeStep.stage}
                    </span>
                    <span className="text-white/30">{"->"}</span>
                    <span className="font-mono text-white/65">
                      {routeStep.evidence}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground flex gap-2 flex-wrap">
                    <span>duty: {routeStep.duty}</span>
                    {routeStep.executable ? (
                      <>
                        <span>·</span>
                        <span>executable: {routeStep.executable}</span>
                      </>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ContentSection>

        <ContentSection
          icon={ShieldAlert}
          title="Blockers"
          subtitle="Why the manager cannot advance"
          count={goal.state.blockers.length}
        >
          {goal.state.blockers.length ? (
            <ul className="space-y-2 text-sm text-amber-100/80">
              {goal.state.blockers.map((blocker, index) => (
                <li
                  key={`${blocker}-${index}`}
                  className="rounded-md border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2"
                >
                  {blocker}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyHint text="No blockers." />
          )}
        </ContentSection>
      </div>
    </article>
  );
}

function ContentSection({
  icon: Icon,
  title,
  subtitle,
  count,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/[0.08] bg-white/[0.02]">
      <header className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-start gap-2 min-w-0">
          <Icon className="w-4 h-4 mt-0.5 text-sky-300 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-white/90">{title}</h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {typeof count === "number" ? (
          <span className="text-xs text-white/45 shrink-0">{count}</span>
        ) : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

export function ManagedGoalsView() {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const {
    data: goals = [],
    isLoading,
    isFetching,
    refetch,
    error,
  } = useManagedGoals();

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return goals;
    return goals.filter((goal) => goalSearchText(goal).includes(query));
  }, [goals, search]);

  const selectedGoal = useMemo(
    () => goals.find((goal) => goal.id === selectedId) ?? null,
    [goals, selectedId],
  );

  useEffect(() => {
    if (filtered.length === 0) {
      if (selectedId) setSelectedId(null);
      return;
    }
    if (!selectedId || !filtered.some((goal) => goal.id === selectedId)) {
      setSelectedId(filtered[0]!.id);
    }
  }, [filtered, selectedId]);

  return (
    <>
      <MasterDetailShell
        title="Goals"
        icon={Target}
        iconClassName="text-sky-400"
        subtitle={`${goals.length} ${goals.length === 1 ? "goal" : "goals"}`}
        error={
          error ? `Failed to load goals: ${(error as Error).message}` : null
        }
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search goals..."
        searchAriaLabel="Search goals"
        accent="sky"
        hasSelection={!!selectedGoal}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
              aria-label="Refresh goals"
            >
              <RefreshCw
                className={cn("h-4 w-4", isFetching && "animate-spin")}
              />
            </Button>
            <Button
              size="sm"
              className="w-9 px-0"
              onClick={() => setCreateOpen(true)}
              title="New goal"
              aria-label="New goal"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </>
        }
        detail={
          selectedGoal ? (
            <GoalDetail
              goal={selectedGoal}
              onBack={() => setSelectedId(null)}
            />
          ) : (
            <EmptyState
              icon={<Target />}
              title="Select a goal"
              hint="Choose a goal from the list."
            />
          )
        }
      >
        {isLoading ? (
          <EmptyState icon={<FileText />} title="Loading goals..." />
        ) : goals.length === 0 ? (
          <EmptyState
            icon={<CircleDot />}
            title="No goals yet"
            hint="Create the first engine-managed goal for this repo."
            action={
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                New goal
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Target />}
            title="No matching goals"
            hint={`Nothing matched "${search}".`}
          />
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((goal) => (
              <li key={goal.id}>
                <GoalRow
                  goal={goal}
                  isActive={selectedId === goal.id}
                  onSelect={() => setSelectedId(goal.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </MasterDetailShell>

      <NewGoalDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

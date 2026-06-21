/**
 * @fileType utility
 * @domain kody
 * @pattern managed-goals
 * @ai-summary Engine managed goal contract. These goals live as one JSON file
 * per goal at `kody-state:.kody/goals/instances/<id>/state.json`.
 */

export type ManagedGoalStateValue = "inactive" | "active" | "paused" | "done";
export type ManagedGoalSchedule = "manual" | "1h" | "1d" | "7d" | "30d";

export const SIMPLE_MANAGED_GOAL_TEMPLATE = "simple";
export const SIMPLE_MANAGED_GOAL_EVIDENCE = "labelledTasksComplete";

export interface ManagedGoalDestination {
  outcome: string;
  evidence: string[];
}

export interface ManagedGoalRouteStep {
  stage: string;
  evidence: string;
  duty: string;
  executable?: string;
  args?: Record<string, unknown>;
}

export interface ManagedGoalDutyScheduleStatus {
  slug: string;
  title?: string;
  cadence?: string;
  lastFiredAt?: string;
  nextEligibleAt?: string;
  state: "due" | "waiting" | "manual" | "disabled" | "blocked";
  reason: string;
}

export interface ManagedGoalDutyScheduleState {
  mode: "duty-cadence";
  lastGoalTickAt: string;
  lastDecision:
    | {
        kind: "dispatch";
        duty: string;
        executable: string;
        reason: string;
        at: string;
      }
    | { kind: "idle"; reason: string; at: string }
    | { kind: "blocked"; reason: string; at: string };
  duties: Record<string, ManagedGoalDutyScheduleStatus>;
}

export interface ManagedGoalState {
  version: 1;
  state: ManagedGoalStateValue;
  type: string;
  destination: ManagedGoalDestination;
  duties: string[];
  route: ManagedGoalRouteStep[];
  schedule?: ManagedGoalSchedule;
  stage?: string;
  facts: Record<string, unknown>;
  blockers: string[];
  scheduleMode?: "duty-cadence" | string;
  scheduleState?: ManagedGoalDutyScheduleState;
  [extraField: string]: unknown;
}

export interface ManagedGoalRecord {
  id: string;
  path: string;
  state: ManagedGoalState;
  source?: "local" | "store";
  recordType?: "instance" | "template";
  updatedAt?: string;
}

function managedGoalRecordTime(goal: ManagedGoalRecord): string {
  const updatedAt =
    goal.updatedAt ??
    (typeof goal.state.updatedAt === "string" ? goal.state.updatedAt : "");
  const createdAt =
    typeof goal.state.createdAt === "string" ? goal.state.createdAt : "";
  return updatedAt || createdAt || "";
}

export function collapseManagedGoalRecordsForList(
  goals: ManagedGoalRecord[],
): ManagedGoalRecord[] {
  const generatedByTemplate = new Map<string, ManagedGoalRecord[]>();
  const directGoals: ManagedGoalRecord[] = [];

  for (const goal of goals) {
    const sourceTemplate =
      typeof goal.state.sourceTemplate === "string"
        ? goal.state.sourceTemplate.trim()
        : "";
    if (!sourceTemplate || sourceTemplate === goal.id) {
      directGoals.push(goal);
      continue;
    }
    const existing = generatedByTemplate.get(sourceTemplate) ?? [];
    existing.push(goal);
    generatedByTemplate.set(sourceTemplate, existing);
  }

  const groupedTemplateIds = new Set(generatedByTemplate.keys());
  const groupedGoals = Array.from(generatedByTemplate.entries()).map(
    ([templateId, instances]) => {
      const sorted = [...instances].sort((a, b) =>
        managedGoalRecordTime(b).localeCompare(managedGoalRecordTime(a)),
      );
      const latest = sorted[0]!;
      const instanceIds = instances.map((goal) => goal.id).sort();

      return {
        ...latest,
        id: templateId,
        recordType: "template" as const,
        updatedAt: managedGoalRecordTime(latest),
        state: {
          ...latest.state,
          state: instances.some((goal) => goal.state.state === "active")
            ? "active"
            : latest.state.state,
          sourceTemplate: templateId,
          latestInstanceId: latest.id,
          instanceCount: instances.length,
          instanceIds,
        },
      };
    },
  );

  return [
    ...directGoals.filter((goal) => !groupedTemplateIds.has(goal.id)),
    ...groupedGoals,
  ].sort((a, b) => a.id.localeCompare(b.id));
}

export interface CreateManagedGoalInput {
  id?: string;
  templateId?: string;
  type: string;
  outcome: string;
  schedule?: ManagedGoalSchedule;
  evidence?: string[];
  route?: ManagedGoalRouteStep[];
}

export interface UpdateManagedGoalInput {
  state?: Exclude<ManagedGoalStateValue, "done">;
  pausedReason?: string;
  type?: string;
  outcome?: string;
  schedule?: ManagedGoalSchedule;
  evidence?: string[];
  route?: ManagedGoalRouteStep[];
}

export function managedGoalPath(goalId: string): string {
  if (!goalId || /[\\/]/.test(goalId) || goalId.includes("..")) {
    throw new Error(`Invalid goalId path: ${JSON.stringify(goalId)}`);
  }
  return `.kody/goals/instances/${goalId}/state.json`;
}

export function slugifyManagedGoalId(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function normalizeEvidenceKey(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 80);
}

export function buildManagedGoalState(
  input: CreateManagedGoalInput,
): ManagedGoalState {
  if (
    input.templateId === SIMPLE_MANAGED_GOAL_TEMPLATE ||
    input.type === SIMPLE_MANAGED_GOAL_TEMPLATE
  ) {
    return {
      version: 1,
      state: "active",
      type: SIMPLE_MANAGED_GOAL_TEMPLATE,
      sourceTemplate: SIMPLE_MANAGED_GOAL_TEMPLATE,
      destination: {
        outcome: input.outcome.trim(),
        evidence: [SIMPLE_MANAGED_GOAL_EVIDENCE],
      },
      schedule: input.schedule ?? "manual",
      duties: [],
      route: [],
      stage: "waiting",
      facts: {
        simpleAttachedTaskCount: 0,
        simpleOpenTaskCount: 0,
        [SIMPLE_MANAGED_GOAL_EVIDENCE]: false,
      },
      blockers: [],
    };
  }

  const evidence = (input.evidence ?? [])
    .map(normalizeEvidenceKey)
    .filter(Boolean);
  const evidenceSet = new Set(evidence);
  const route = (input.route ?? [])
    .map((step) => ({
      stage: step.stage.trim(),
      evidence: normalizeEvidenceKey(step.evidence),
      duty: step.duty.trim(),
      ...(step.executable?.trim()
        ? { executable: step.executable.trim() }
        : {}),
      ...(step.args ? { args: step.args } : {}),
    }))
    .filter(
      (step) =>
        step.stage &&
        step.evidence &&
        step.duty &&
        evidenceSet.has(step.evidence),
    );
  const duties = Array.from(new Set(route.map((step) => step.duty))).sort();

  return {
    version: 1,
    state: "active",
    type: input.type.trim() || "general",
    destination: {
      outcome: input.outcome.trim(),
      evidence,
    },
    schedule: input.schedule ?? "manual",
    duties,
    route,
    stage: route[0]?.stage,
    facts: {},
    blockers: [],
  };
}

export function isManagedGoalState(value: unknown): value is ManagedGoalState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const goal = value as Partial<ManagedGoalState>;
  return (
    goal.version === 1 &&
    typeof goal.state === "string" &&
    typeof goal.type === "string" &&
    !!goal.destination &&
    typeof goal.destination === "object" &&
    Array.isArray(
      (goal.destination as Partial<ManagedGoalDestination>).evidence,
    ) &&
    Array.isArray(goal.duties) &&
    Array.isArray(goal.route) &&
    !!goal.facts &&
    typeof goal.facts === "object" &&
    !Array.isArray(goal.facts) &&
    Array.isArray(goal.blockers)
  );
}

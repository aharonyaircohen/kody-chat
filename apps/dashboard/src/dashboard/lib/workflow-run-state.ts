export type WorkflowRunStatus = "running" | "blocked" | "failed" | "done";

export interface WorkflowRunState {
  status: WorkflowRunStatus;
  currentStepId?: string;
  completedStepIds: string[];
  transitionCounts: Record<string, number>;
  facts: Record<string, unknown>;
  evidence: Record<string, boolean>;
  artifacts: Array<{ label: string; url?: string; path?: string }>;
  blocker?: string;
}

export interface WorkflowRunStateRecord {
  workflowId: string;
  runId: string;
  state: WorkflowRunState;
}

export function normalizeWorkflowRunState(
  raw: unknown,
): WorkflowRunState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (
    value.status !== "running" &&
    value.status !== "blocked" &&
    value.status !== "failed" &&
    value.status !== "done"
  )
    return null;

  const completedStepIds = Array.isArray(value.completedStepIds)
    ? value.completedStepIds.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  const transitionCounts =
    value.transitionCounts &&
    typeof value.transitionCounts === "object" &&
    !Array.isArray(value.transitionCounts)
      ? Object.fromEntries(
          Object.entries(value.transitionCounts).filter(
            (entry): entry is [string, number] =>
              Number.isInteger(entry[1]) && (entry[1] as number) >= 0,
          ),
        )
      : {};
  const facts =
    value.facts &&
    typeof value.facts === "object" &&
    !Array.isArray(value.facts)
      ? { ...(value.facts as Record<string, unknown>) }
      : {};
  const evidence =
    value.evidence &&
    typeof value.evidence === "object" &&
    !Array.isArray(value.evidence)
      ? Object.fromEntries(
          Object.entries(value.evidence).filter(
            (entry): entry is [string, boolean] =>
              typeof entry[1] === "boolean",
          ),
        )
      : {};
  const artifacts = Array.isArray(value.artifacts)
    ? value.artifacts.filter(
        (item): item is { label: string; url?: string; path?: string } =>
          !!item &&
          typeof item === "object" &&
          typeof (item as { label?: unknown }).label === "string" &&
          ((item as { url?: unknown }).url === undefined ||
            typeof (item as { url?: unknown }).url === "string") &&
          ((item as { path?: unknown }).path === undefined ||
            typeof (item as { path?: unknown }).path === "string"),
      )
    : [];

  return {
    status: value.status,
    ...(typeof value.currentStepId === "string"
      ? { currentStepId: value.currentStepId }
      : {}),
    completedStepIds,
    transitionCounts,
    facts,
    evidence,
    artifacts: artifacts.map((artifact) => ({ ...artifact })),
    ...(typeof value.blocker === "string" ? { blocker: value.blocker } : {}),
  };
}

import {
  createAgencyRequestState,
  type AgencyRequestExecution,
  type AgencyRequestState,
} from "@kody-ade/agency-domain";

export interface AgencyRequestRecord {
  slug: string;
  state: AgencyRequestState;
}

interface StartPorts {
  read(slug: string): Promise<AgencyRequestRecord | null>;
  save(slug: string, state: AgencyRequestState): Promise<void>;
  dispatch(execution: AgencyRequestExecution): Promise<{ runId: string }>;
}

interface CompletionPorts {
  findByRun(runId: string): Promise<AgencyRequestRecord[]>;
  save(slug: string, state: AgencyRequestState): Promise<void>;
}

type CompletionInput = {
  workflowId: string;
  runId: string;
  status: "success" | "failed" | "blocked";
  summary?: string;
};

function normalizedFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message.trim() || "Workflow dispatch failed").slice(0, 2_000);
}

function withState(
  state: AgencyRequestState,
  patch: Partial<AgencyRequestState>,
): AgencyRequestState {
  return createAgencyRequestState({ ...state, ...patch });
}

export async function startAgencyRequest(slug: string, ports: StartPorts) {
  const record = await ports.read(slug);
  if (!record) return { kind: "not-found" as const };
  const existingRun = record.state.related.find((ref) => ref.kind === "run");
  if (
    existingRun &&
    (record.state.phase === "running" ||
      record.state.phase === "monitoring" ||
      record.state.phase === "done")
  ) {
    return { kind: "existing" as const, runId: existingRun.id };
  }
  if (record.state.phase !== "waiting-approval") {
    return { kind: "invalid-phase" as const, phase: record.state.phase };
  }
  if (!record.state.execution) {
    const message = "The approved plan has no executable Workflow target.";
    await ports.save(
      slug,
      withState(record.state, { phase: "blocked", blockers: [message] }),
    );
    return { kind: "blocked" as const, message };
  }

  await ports.save(
    slug,
    withState(record.state, { phase: "running", blockers: [] }),
  );
  try {
    const result = await ports.dispatch(record.state.execution);
    await ports.save(
      slug,
      withState(record.state, {
        phase: "monitoring",
        blockers: [],
        related: [
          ...record.state.related.filter(
            (ref) => !(ref.kind === "run" && ref.id === result.runId),
          ),
          { kind: "run", id: result.runId },
        ],
      }),
    );
    return { kind: "started" as const, runId: result.runId };
  } catch (error) {
    const message = normalizedFailure(error);
    await ports.save(
      slug,
      withState(record.state, { phase: "blocked", blockers: [message] }),
    );
    throw error;
  }
}

export async function completeAgencyRequestRun(
  input: CompletionInput,
  ports: CompletionPorts,
): Promise<{ updated: number }> {
  const records = await ports.findByRun(input.runId);
  const summary = input.summary?.trim().slice(0, 2_000);
  for (const record of records) {
    const succeeded = input.status === "success";
    const evidence = succeeded
      ? [
          ...record.state.evidence,
          `Workflow ${input.workflowId} run ${input.runId} succeeded${summary ? `: ${summary}` : "."}`,
        ]
      : record.state.evidence;
    const blockers = succeeded
      ? []
      : [
          `Workflow ${input.workflowId} run ${input.runId} ${input.status}${summary ? `: ${summary}` : "."}`,
        ];
    await ports.save(
      record.slug,
      withState(record.state, {
        phase: succeeded ? "done" : "blocked",
        evidence,
        blockers,
      }),
    );
  }
  return { updated: records.length };
}

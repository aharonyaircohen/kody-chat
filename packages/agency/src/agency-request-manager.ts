import {
  createAgencyRequestState,
  type AgencyRequestExecution,
  type AgencyRequestSource,
  type AgencyRequestState,
} from "@kody-ade/agency-domain";
import type { StrategyBlueprint } from "@kody-ade/engine-contracts";

export interface AgencyRequestTodoDraft {
  title: string;
  description: string;
  items: Array<{
    title: string;
    body: string;
    completed: boolean;
    meta: Record<string, unknown>;
  }>;
  agencyRequest: AgencyRequestState;
}

export interface AgencyRequestManagerPorts {
  findBySource(source: AgencyRequestSource): Promise<{ slug: string } | null>;
  create(input: AgencyRequestTodoDraft): Promise<{ slug: string }>;
  resolveBlueprint?(
    id: string,
  ): Promise<{ blueprint: StrategyBlueprint; instructions: string } | null>;
}

export interface SubmitAgencyRequestInput {
  blueprintId?: string;
  source: AgencyRequestSource;
  answers: Readonly<Record<string, unknown>>;
}

export interface AgencyRequestHandoff {
  type: "kody";
  message: string;
  displayContent: string;
}

export interface SubmitAgencyRequestResult {
  created: boolean;
  todoSlug: string;
  handoff: AgencyRequestHandoff;
}

interface PreparedAgencyRequestPorts {
  read(slug: string): Promise<{
    slug: string;
    state: AgencyRequestState;
  } | null>;
  validateExecution(execution: AgencyRequestExecution): Promise<{
    execution: AgencyRequestExecution;
    issues: string[];
  }>;
  save(slug: string, state: AgencyRequestState): Promise<void>;
}

export async function assessPreparedAgencyRequest(
  slug: string,
  ports: PreparedAgencyRequestPorts,
) {
  const record = await ports.read(slug);
  if (!record) return { kind: "not-found" as const };
  const execution = record.state.execution;
  const relatedStrategy = record.state.related.find(
    (ref) => ref.kind === "strategy",
  );
  const inputBlueprintId =
    typeof execution?.input.blueprintId === "string"
      ? execution.input.blueprintId.trim()
      : "";
  const strategyId = relatedStrategy?.id ?? inputBlueprintId;
  if (!strategyId || !execution) {
    return { kind: "requires-reasoning" as const };
  }

  const validation = await ports.validateExecution(execution);
  if (validation.issues.length > 0) {
    const state = createAgencyRequestState({
      ...record.state,
      phase: "blocked",
      blockers: validation.issues,
    });
    await ports.save(slug, state);
    return { kind: "blocked" as const, issues: validation.issues };
  }

  const workflowId = validation.execution.workflowId;
  const activationIds = (validation.execution.activations ?? []).map(
    (activation) => `${activation.kind}:${activation.id}`,
  );
  const state = createAgencyRequestState({
    ...record.state,
    phase: "waiting-approval",
    questions: [],
    plan: [
      `Activate the approved Blueprint resources: ${activationIds.join(", ")}.`,
      `Run Workflow ${workflowId} with the saved Blueprint and repository request.`,
      "Monitor the Workflow until it reports end-to-end success or a precise blocker.",
    ],
    execution: validation.execution,
    evidence: [
      ...record.state.evidence,
      `Validated Strategy Blueprint ${strategyId} and Workflow ${workflowId}.`,
    ],
    blockers: [],
  });
  await ports.save(slug, state);
  return { kind: "ready" as const, workflowId };
}

function answer(
  answers: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = answers[key];
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, 20_000) : undefined;
}

function handoff(todoSlug: string): AgencyRequestHandoff {
  return {
    type: "kody",
    displayContent: "Request submitted for assessment.",
    message: [
      `Agency request assessment handoff for Todo ${JSON.stringify(todoSlug)}.`,
      "Read the Todo and inspect the active repository, installed Store solutions, available Workflows, Triggers, Loops, tools, permissions, and success evidence.",
      "When the Todo already contains a Strategy Blueprint execution, assess that saved Blueprint and preserve its Workflow, inputs, and activations; do not replace it with a different automation path.",
      "A Workflow named in execution.activations may intentionally be absent from the active Workflow list. Read that exact Workflow directly because Store candidates are readable before activation; do not block the request merely because the Workflow is not installed yet.",
      "Decide whether the request is clear and executable. Discover facts yourself. If a user decision is still required, update the request to waiting-information and ask only clear questions with the relevant context and choices.",
      "For default-branch CI requests, use the repository CI rollup rather than selecting a run from the raw Actions list; Kody orchestration runs are not repository CI.",
      "If it is executable, save a concrete plan and the exact verified Workflow id and input in execution, update it to waiting-approval, and present one approval action. Do not make consequential changes before approval.",
      "After approval, dispatch the saved Workflow once, attach its Run id, monitor its durable completion event, and mark the request done only with end-to-end evidence. Otherwise mark it blocked with the precise reason.",
    ].join("\n"),
  };
}

export async function submitAgencyRequest(
  input: SubmitAgencyRequestInput,
  ports: AgencyRequestManagerPorts,
): Promise<SubmitAgencyRequestResult> {
  const source = createAgencyRequestState({
    phase: "assessing",
    source: input.source,
    requirement: {
      outcome: answer(input.answers, "desiredOutcome") ?? "Missing outcome",
    },
    questions: [],
    plan: [],
    evidence: [],
    blockers: [],
    related: [],
  }).source;
  const outcome = answer(input.answers, "desiredOutcome");
  if (!outcome) throw new Error("Agency request outcome is required");

  const blueprintId = input.blueprintId?.trim();
  const resolved = blueprintId
    ? await ports.resolveBlueprint?.(blueprintId)
    : null;
  if (blueprintId && !resolved) {
    throw new Error(`Strategy Blueprint "${blueprintId}" is unavailable`);
  }

  const existing = await ports.findBySource(source);
  if (existing) {
    return {
      created: false,
      todoSlug: existing.slug,
      handoff: handoff(existing.slug),
    };
  }

  const requirement = {
    outcome,
    ...(answer(input.answers, "activation")
      ? { activation: answer(input.answers, "activation") }
      : {}),
    ...(answer(input.answers, "allowedActions")
      ? { permissions: answer(input.answers, "allowedActions") }
      : {}),
    ...(answer(input.answers, "successCriteria")
      ? { success: answer(input.answers, "successCriteria") }
      : {}),
    ...(answer(input.answers, "additionalContext")
      ? { context: answer(input.answers, "additionalContext") }
      : {}),
  };
  const agencyRequest = createAgencyRequestState({
    phase: "assessing",
    source,
    requirement,
    questions: [],
    plan: [],
    evidence: [],
    blockers: [],
    ...(resolved
      ? {
          execution: {
            workflowId: resolved.blueprint.application.workflowId,
            input: {
              ...(resolved.blueprint.application.workflowInput ?? {}),
              blueprintId: resolved.blueprint.id,
              blueprintVersion: resolved.blueprint.version,
              requestId: input.source.kind === "guided-flow" ? input.source.effectId : (input.source as any).requestId || '',
              outcome,
              blueprint: resolved.blueprint,
              instructions: resolved.instructions,
              request: requirement,
            },
            activations: [
              {
                kind: "workflow",
                id: resolved.blueprint.application.workflowId,
              },
              ...resolved.blueprint.application.activate,
            ],
          },
        }
      : {}),
    related: resolved
      ? [
          { kind: "strategy", id: resolved.blueprint.id },
          {
            kind: "workflow",
            id: resolved.blueprint.application.workflowId,
          },
          ...resolved.blueprint.application.activate,
        ]
      : [],
  });
  const created = await ports.create({
    title: outcome.slice(0, 160),
    description: "Kody is assessing this request before proposing execution.",
    items: [
      {
        title: "Assess feasibility and prepare the execution plan",
        body: "Kody must verify the repository, available automation, permissions, and success evidence.",
        completed: false,
        meta: { kind: "agency-request-readiness" },
      },
    ],
    agencyRequest,
  });

  return {
    created: true,
    todoSlug: created.slug,
    handoff: handoff(created.slug),
  };
}

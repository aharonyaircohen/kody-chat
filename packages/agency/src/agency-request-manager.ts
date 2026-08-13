import {
  createAgencyRequestState,
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
              requestId: input.source.effectId,
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

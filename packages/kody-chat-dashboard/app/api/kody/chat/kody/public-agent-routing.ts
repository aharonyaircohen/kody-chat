import { generateText } from "ai";
import { z } from "zod";

import {
  publicAgentPurpose,
  type PublicDelegationAgent,
} from "./public-agent-definition";
import { MAX_PARALLEL_ASSIGNMENTS } from "./public-agent-limits";

export { MAX_PARALLEL_ASSIGNMENTS } from "./public-agent-limits";
const PUBLIC_AGENT_ROUTING_TIMEOUT_MS = 10_000;
const ROUTING_STOP_WORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "as",
  "best",
  "by",
  "chat",
  "current",
  "currently",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "please",
  "run",
  "specialist",
  "the",
  "this",
  "to",
  "with",
]);

const routeDecisionSchema = z.object({
  mode: z.enum(["self", "delegate"]),
  assignments: z
    .array(
      z.object({
        agent: z.string().min(1).max(64),
        capability: z.string().min(1).max(128).optional(),
        task: z.string().trim().min(1).max(8000),
      }),
    )
    .max(MAX_PARALLEL_ASSIGNMENTS),
});

export interface PublicAgentAssignment {
  agent: string;
  capability?: string;
  task: string;
}

export type PublicAgentRouteDecision =
  { mode: "self" } | { mode: "delegate"; assignments: PublicAgentAssignment[] };

const PROJECT_ASSESSMENT_FIELDS = [
  "projectExpectations",
  "businessCriticality",
  "teamSizeAndRoles",
  "relevantExperience",
  "systemKnowledge",
  "maintenanceTime",
] as const;

const PROJECT_ASSESSMENT_INTAKE_FIELDS = [
  {
    name: "projectExpectations",
    label: "Project goals and expected growth",
    description:
      "What should this project achieve over the next 12–24 months? Include expected users or load, growth, major product or technical changes, and important deadlines.",
  },
  {
    name: "businessCriticality",
    label: "Business importance and acceptable failures",
    description:
      "Explain what happens if the system is unavailable, loses data, or has a security incident. Include acceptable downtime or data loss, customer or revenue impact, and any legal or compliance needs.",
  },
  {
    name: "teamSizeAndRoles",
    label: "Active team size and roles",
    description:
      "Who regularly builds, reviews, operates, or supports this system? Include employees, contractors, and AI agents, their roles, and whether their involvement is full-time or part-time.",
  },
  {
    name: "relevantExperience",
    label: "Relevant team experience",
    description:
      "Describe the team’s experience with the main technologies, architecture, expected scale, security, and production operations. Mention important areas where the team is still learning.",
  },
  {
    name: "systemKnowledge",
    label: "Shared system knowledge and ownership gaps",
    description:
      "Who understands the important areas today, and how well is that knowledge documented or shared? Mention new team members, knowledge gaps, and areas understood by only one person.",
  },
  {
    name: "maintenanceTime",
    label: "Real maintenance time available",
    description:
      "How much time can the team actually spend on maintenance after feature work and support? Include time for technical debt, refactoring, tests, dependencies, and security, using a weekly or monthly estimate.",
  },
] as const;

export function buildProjectAssessmentIntakeSpec() {
  return {
    root: "form",
    elements: {
      form: {
        type: "GuidedForm",
        props: {
          title: "Project assessment",
          body: "Kody will inspect the repository, GitHub history, code size, architecture, and technical state automatically. Add only the business and team context that cannot be learned reliably from the repository. Honest estimates are enough.",
          fields: PROJECT_ASSESSMENT_INTAKE_FIELDS.map((field) => ({
            ...field,
            value: "",
            inputType: "text" as const,
          })),
          submitLabel: "Start assessment",
        },
      },
    },
  };
}

export function buildProjectAssessmentIntakeInstruction(): string {
  const fieldInstructions = PROJECT_ASSESSMENT_INTAKE_FIELDS.map(
    (field, index) =>
      `${index === PROJECT_ASSESSMENT_INTAKE_FIELDS.length - 1 ? "and " : ""}\`${field.name}\` labeled \`${field.label}\` described as \`${field.description}\`${index === PROJECT_ASSESSMENT_INTAKE_FIELDS.length - 1 ? "" : ";"}`,
  );
  return [
    "The user requested a complete project assessment.",
    "Before starting any assessment work, call `show_view` once with purpose `guided-form`.",
    "Use title `Project assessment`, submit label `Start assessment`, and body `Kody will inspect the repository, GitHub history, code size, architecture, and technical state automatically. Add only the business and team context that cannot be learned reliably from the repository. Honest estimates are enough.`",
    "Use exactly these six editable fields, including each description:",
    ...fieldInstructions,
    "Do not ask for repository size, architecture, contribution history, or the required team size because Kody must determine those from evidence and report them as findings.",
    "Do not ask these questions in prose and do not add fields.",
  ].join(" ");
}

export function routeProjectAssessmentSubmission(
  userText: string,
  assignedAgents: readonly PublicDelegationAgent[],
): PublicAgentRouteDecision | null {
  if (!/<view_result>[\s\S]*<\/view_result>/i.test(userText)) return null;
  if (
    !PROJECT_ASSESSMENT_FIELDS.every((field) => userText.includes(`"${field}"`))
  ) {
    return null;
  }
  const cto = assignedAgents.find(({ slug }) => slug === "cto");
  if (!cto) return null;
  const capabilities = (cto.capabilities ?? [])
    .filter((slug) => slug.startsWith("assess-"))
    .slice(0, MAX_PARALLEL_ASSIGNMENTS);
  if (capabilities.length === 0) return null;
  return {
    mode: "delegate",
    assignments: capabilities.map((capability) => ({
      agent: cto.slug,
      capability,
      task: `Complete only the ${capability} assessment track for the current repository.`,
    })),
  };
}

/** Whether this parent chat has an assigned specialist roster to route across. */
export function shouldRoutePublicAgentChat(input: {
  clientSurface: boolean;
  assignedSubagentCount: number;
}): boolean {
  return !input.clientSurface && input.assignedSubagentCount > 0;
}

/** Short social turns do not need a routing model call or research tools. */
export function isClearlyConversationalTurn(userText: string): boolean {
  const normalized = userText.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 160) return false;
  return (
    /^(?:hi|hello|hey|thanks|thank you|good (?:morning|afternoon|evening))\b/.test(
      normalized,
    ) || /^what can you help me with\??$/.test(normalized)
  );
}

export function isCompleteProjectAssessmentRequest(userText: string): boolean {
  if (/<view_result>[\s\S]*<\/view_result>/i.test(userText)) return false;
  const text = userText.trim().toLowerCase();
  const assessment = /\b(?:assessment|assess|audit|review)\b/.test(text);
  const project = /\b(?:project|repository|repo|system)\b/.test(text);
  const complete =
    /\b(?:complete|comprehensive|deep|full|overall|whole|entire)\b/.test(text);
  const namedProjectAssessment =
    /\b(?:project|repository|repo|system)(?:\s+health)?\s+assessment\b/.test(
      text,
    );
  return assessment && project && (complete || namedProjectAssessment);
}

export function isParentOwnedArchitectureAdvice(userText: string): boolean {
  const text = userText.trim();
  return (
    /^(?:should\b|(?:can|could)\s+we\b)/i.test(text) &&
    /\b(?:add|build|create|introduce|merge|replace|split)\b/i.test(text) &&
    /\b(?:architecture|chat system|component|layer|service|system)\b/i.test(
      text,
    )
  );
}

export function isParentOwnedArchitectureExplanation(
  userText: string,
): boolean {
  const text = userText.trim();
  return (
    /^\s*(?:how does|explain|describe|what is)\b/i.test(text) &&
    /\b(?:kody chat|chat system|chat architecture)\b/i.test(text) &&
    /\b(?:project|repository|repo)\b/i.test(text)
  );
}

function routeExplicitWorkflowExecution(
  userText: string,
  assignedAgents: readonly PublicDelegationAgent[],
): PublicAgentRouteDecision | null {
  if (
    !/\b(?:run|rerun|execute|start|launch|trigger)\b/i.test(userText) ||
    !/\b(?:workflow|wf)\b/i.test(userText)
  ) {
    return null;
  }
  const operator = assignedAgents.find((agent) =>
    /\b(?:operational|operations|runs?|ci|releases?)\b/i.test(
      publicAgentPurpose(agent),
    ),
  );
  return operator
    ? {
        mode: "delegate",
        assignments: [{ agent: operator.slug, task: userText.trim() }],
      }
    : null;
}

function routingTerms(value: string): Set<string> {
  const normalizeTerm = (term: string): string => {
    if (term.endsWith("ies") && term.length > 4) {
      return `${term.slice(0, -3)}y`;
    }
    for (const suffix of ["ers", "ing", "ed", "ly", "es", "s"]) {
      if (term.endsWith(suffix) && term.length - suffix.length >= 3) {
        return term.slice(0, -suffix.length);
      }
    }
    return term;
  };
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length > 1 && !ROUTING_STOP_WORDS.has(term))
      .map(normalizeTerm),
  );
}

/** Deterministic fallback derived only from configured Agent definitions. */
export function inferPublicAgentRouteFromDefinitions(
  userText: string,
  assignedAgents: readonly PublicDelegationAgent[],
): PublicAgentRouteDecision {
  const requestedTerms = routingTerms(userText);
  const ranked = assignedAgents
    .map((agent) => {
      const titleTerms = routingTerms(agent.title);
      const purposeTerms = routingTerms(publicAgentPurpose(agent));
      const score = [...requestedTerms].reduce(
        (total, term) =>
          total +
          (titleTerms.has(term) ? 2 : 0) +
          (purposeTerms.has(term) ? 1 : 0),
        0,
      );
      return { agent, score };
    })
    .sort((left, right) => right.score - left.score);
  const winner = ranked[0];
  const runnerUp = ranked[1];
  const multiDomainMatches = ranked
    .filter(({ score }) => score >= 2)
    .slice(0, MAX_PARALLEL_ASSIGNMENTS);
  if (multiDomainMatches.length > 1) {
    const task = `Complete only the part of this request owned by your configured definition: ${userText.trim()}`;
    return {
      mode: "delegate",
      assignments: multiDomainMatches.map(({ agent }) => ({
        agent: agent.slug,
        task,
      })),
    };
  }
  if (!winner || winner.score < 1 || winner.score === runnerUp?.score) {
    return { mode: "self" };
  }
  return {
    mode: "delegate",
    assignments: [{ agent: winner.agent.slug, task: userText.trim() }],
  };
}

export function buildPublicAgentRoutingPrompt(
  assignedAgents: readonly PublicDelegationAgent[],
): string {
  const catalog = assignedAgents
    .map((agent) => {
      const capabilities = agent.capabilities?.length
        ? `\n  Capabilities: ${agent.capabilities.join(", ")}`
        : "";
      return `- ${agent.slug} (${agent.title}): ${publicAgentPurpose(agent)}${capabilities}`;
    })
    .join("\n");
  return [
    "Choose whether Kody should answer directly or assign this request to configured specialists.",
    "Choose only from the assigned Agents below and judge them only by their definitions.",
    "Match by meaning, not by exact word overlap.",
    "Use one assignment for ordinary single-domain requests. Use multiple assignments only for independent work that can run in parallel.",
    "You may assign the same Agent more than once when it owns several distinct focused tasks. Return at most 9 assignments.",
    "When an assignment targets one listed Capability, include its exact slug as capability. For a complete assessment, assign its independent Capability tracks separately so they run in parallel.",
    'Return JSON only: {"mode":"self","assignments":[]} or {"mode":"delegate","assignments":[{"agent":"slug","capability":"optional-listed-capability","task":"focused self-contained task"}]}',
    "Use mode self for general conversation, presentation-only work, or when no definition clearly owns the request.",
    "Assigned Agents:",
    catalog,
  ].join("\n");
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}

export function parsePublicAgentRouteDecision(
  text: string,
  assignedAgents: readonly PublicDelegationAgent[],
): PublicAgentRouteDecision {
  return (
    tryParsePublicAgentRouteDecision(text, assignedAgents) ?? {
      mode: "self",
    }
  );
}

function tryParsePublicAgentRouteDecision(
  text: string,
  assignedAgents: readonly PublicDelegationAgent[],
): PublicAgentRouteDecision | null {
  const json = extractJsonObject(text);
  if (!json) return null;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  const parsed = routeDecisionSchema.safeParse(value);
  if (!parsed.success) return null;
  if (parsed.data.mode === "self") {
    return { mode: "self" };
  }
  const assignedBySlug = new Map(
    assignedAgents.map((agent) => [agent.slug, agent] as const),
  );
  const assignments = parsed.data.assignments.filter(
    ({ agent, capability }) => {
      const assigned = assignedBySlug.get(agent);
      if (!assigned) return false;
      return (
        !capability || assigned.capabilities?.includes(capability) === true
      );
    },
  );
  return assignments.length > 0
    ? { mode: "delegate", assignments }
    : { mode: "self" };
}

interface RoutePublicAgentTaskOptions {
  userText: string;
  conversationContext?: string;
  assignedAgents: readonly PublicDelegationAgent[];
  model: Parameters<typeof generateText>[0]["model"];
  generate?: typeof generateText;
}

export async function routePublicAgentTask({
  userText,
  conversationContext,
  assignedAgents,
  model,
  generate = generateText,
}: RoutePublicAgentTaskOptions): Promise<PublicAgentRouteDecision> {
  if (!userText.trim() || assignedAgents.length === 0) {
    return { mode: "self" };
  }
  const assessment = routeProjectAssessmentSubmission(userText, assignedAgents);
  if (assessment) return assessment;
  if (isClearlyConversationalTurn(userText)) {
    return { mode: "self" };
  }
  if (isCompleteProjectAssessmentRequest(userText)) {
    return { mode: "self" };
  }
  const workflowExecution = routeExplicitWorkflowExecution(
    userText,
    assignedAgents,
  );
  if (workflowExecution) return workflowExecution;
  if (
    isParentOwnedArchitectureAdvice(userText) ||
    isParentOwnedArchitectureExplanation(userText)
  ) {
    return { mode: "self" };
  }
  const inferred = inferPublicAgentRouteFromDefinitions(
    userText,
    assignedAgents,
  );
  try {
    const routingRequest = conversationContext?.trim()
      ? [
          "Recent conversation:",
          conversationContext.trim(),
          "",
          "Current request:",
          userText.trim(),
        ].join("\n")
      : userText;
    const response = await generate({
      model,
      abortSignal: AbortSignal.timeout(PUBLIC_AGENT_ROUTING_TIMEOUT_MS),
      system: buildPublicAgentRoutingPrompt(assignedAgents),
      messages: [{ role: "user", content: routingRequest }],
      tools: undefined,
      maxOutputTokens: 500,
    });
    const decision = tryParsePublicAgentRouteDecision(
      response.text,
      assignedAgents,
    );
    if (!decision) return inferred;
    if (
      inferred.mode === "delegate" &&
      inferred.assignments.length === 1 &&
      decision.mode === "delegate" &&
      decision.assignments.length === 1 &&
      inferred.assignments[0]!.agent !== decision.assignments[0]!.agent
    ) {
      return inferred;
    }
    if (decision.mode === "delegate" && decision.assignments.length > 1) {
      return decision;
    }
    return decision;
  } catch {
    return inferred;
  }
}

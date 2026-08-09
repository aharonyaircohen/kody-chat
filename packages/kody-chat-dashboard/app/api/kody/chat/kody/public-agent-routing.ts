import { generateText } from "ai";
import { z } from "zod";

import {
  publicAgentPurpose,
  type PublicDelegationAgent,
} from "./public-agent-definition";

const MAX_PARALLEL_ASSIGNMENTS = 3;
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
        task: z.string().trim().min(1).max(8000),
      }),
    )
    .max(MAX_PARALLEL_ASSIGNMENTS),
});

export interface PublicAgentAssignment {
  agent: string;
  task: string;
}

export type PublicAgentRouteDecision =
  { mode: "self" } | { mode: "delegate"; assignments: PublicAgentAssignment[] };

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
    .map(
      (agent) =>
        `- ${agent.slug} (${agent.title}): ${publicAgentPurpose(agent)}`,
    )
    .join("\n");
  return [
    "Choose whether Kody should answer directly or assign this request to configured specialists.",
    "Choose only from the assigned Agents below and judge them only by their definitions.",
    "Use one Agent for a single-domain request. Use multiple Agents only for independent work that truly spans domains.",
    'Return JSON only: {"mode":"self","assignments":[]} or {"mode":"delegate","assignments":[{"agent":"slug","task":"focused self-contained task"}]}',
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
  const json = extractJsonObject(text);
  if (!json) return { mode: "self" };
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return { mode: "self" };
  }
  const parsed = routeDecisionSchema.safeParse(value);
  if (!parsed.success || parsed.data.mode === "self") {
    return { mode: "self" };
  }
  const assignedSlugs = new Set(assignedAgents.map((agent) => agent.slug));
  const seen = new Set<string>();
  const assignments = parsed.data.assignments.filter(({ agent }) => {
    if (!assignedSlugs.has(agent) || seen.has(agent)) return false;
    seen.add(agent);
    return true;
  });
  return assignments.length > 0
    ? { mode: "delegate", assignments }
    : { mode: "self" };
}

interface RoutePublicAgentTaskOptions {
  userText: string;
  assignedAgents: readonly PublicDelegationAgent[];
  model: Parameters<typeof generateText>[0]["model"];
  generate?: typeof generateText;
}

export async function routePublicAgentTask({
  userText,
  assignedAgents,
  model,
  generate = generateText,
}: RoutePublicAgentTaskOptions): Promise<PublicAgentRouteDecision> {
  if (!userText.trim() || assignedAgents.length === 0) {
    return { mode: "self" };
  }
  if (isClearlyConversationalTurn(userText)) {
    return { mode: "self" };
  }
  const inferred = inferPublicAgentRouteFromDefinitions(
    userText,
    assignedAgents,
  );
  if (inferred.mode === "delegate") {
    return inferred;
  }
  try {
    const response = await generate({
      model,
      abortSignal: AbortSignal.timeout(PUBLIC_AGENT_ROUTING_TIMEOUT_MS),
      system: buildPublicAgentRoutingPrompt(assignedAgents),
      messages: [{ role: "user", content: userText }],
      tools: undefined,
      maxOutputTokens: 500,
    });
    const decision = parsePublicAgentRouteDecision(
      response.text,
      assignedAgents,
    );
    if (decision.mode === "delegate" && decision.assignments.length > 1) {
      return decision;
    }
    return decision;
  } catch {
    return inferred;
  }
}

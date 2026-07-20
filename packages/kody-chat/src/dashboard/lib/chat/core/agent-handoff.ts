import type { AgentHandoff } from "../../chat-types";

interface AgentIdentity {
  slug: string;
  title: string;
}

export function createAgentHandoff(
  from: AgentIdentity,
  to: AgentIdentity,
  switchedAt = new Date().toISOString(),
): AgentHandoff {
  return {
    fromSlug: from.slug,
    fromTitle: from.title,
    toSlug: to.slug,
    toTitle: to.title,
    switchedAt,
  };
}

export function latestAgentHandoff(
  handoffs: ReadonlyArray<AgentHandoff>,
): AgentHandoff | null {
  return handoffs.at(-1) ?? null;
}

export function buildAgentHandoffPrompt(handoff: AgentHandoff): string {
  return [
    "## Active agent handoff",
    `Active agent changed from ${handoff.fromTitle} (@${handoff.fromSlug}) to ${handoff.toTitle} (@${handoff.toSlug}).`,
    `Assistant messages before this handoff were written by ${handoff.fromTitle}, not by ${handoff.toTitle}; use them as context only.`,
    `Respond as ${handoff.toTitle}. The current agent profile is authoritative, and you must ignore any previous identity claims when describing who you are.`,
  ].join("\n\n");
}

export function resolveAgentHandoffForPrompt(
  value: unknown,
  activeAgent: AgentIdentity,
): AgentHandoff | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AgentHandoff>;
  if (
    typeof candidate.fromSlug !== "string" ||
    typeof candidate.toSlug !== "string" ||
    candidate.fromSlug.length === 0 ||
    candidate.fromSlug.length > 100 ||
    candidate.toSlug !== activeAgent.slug
  ) {
    return null;
  }
  const safeSlug = (slug: string) =>
    /^[a-z0-9][a-z0-9:_-]*$/i.test(slug) ? slug : null;
  const fromSlug = safeSlug(candidate.fromSlug);
  const toSlug = safeSlug(candidate.toSlug);
  if (!fromSlug || !toSlug) return null;

  return {
    fromSlug,
    // The previous title is client-supplied, so use its validated slug in the
    // system prompt. The active title comes from the server-resolved profile.
    fromTitle: fromSlug,
    toSlug,
    toTitle: activeAgent.title,
    switchedAt:
      typeof candidate.switchedAt === "string"
        ? candidate.switchedAt
        : new Date(0).toISOString(),
  };
}

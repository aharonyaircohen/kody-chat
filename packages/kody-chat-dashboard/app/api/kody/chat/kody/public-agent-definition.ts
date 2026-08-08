export interface PublicDelegationAgent {
  slug: string;
  title: string;
  body: string;
  capabilities?: string[];
}

function firstParagraph(markdown: string): string | null {
  const paragraphs = markdown
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return (
    paragraphs.find(
      (paragraph) => !paragraph.startsWith("#") && !paragraph.startsWith("- "),
    ) ?? null
  );
}

/** Returns the routing purpose already written in the public Agent definition. */
export function publicAgentPurpose(agent: PublicDelegationAgent): string {
  const agentSection = /(?:^|\n)##\s+Agent\s*\n+([\s\S]*?)(?=\n##\s+|$)/i.exec(
    agent.body,
  )?.[1];
  return (
    firstParagraph(agentSection ?? agent.body)?.replace(/\s+/g, " ") ??
    agent.title
  );
}

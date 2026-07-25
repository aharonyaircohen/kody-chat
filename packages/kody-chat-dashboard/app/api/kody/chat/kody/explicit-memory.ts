import type { MemoryKind } from "@kody-ade/memory";

export interface ExplicitMemoryDraft {
  readonly scope: "user" | "repository";
  readonly kind: MemoryKind;
  readonly title: string;
  readonly summary: string;
  readonly body: string;
  readonly reason: string;
}

const EXPLICIT_MEMORY_RE =
  /^\s*(?:please\s+)?(?:remember|store\s+this|save\s+this(?:\s+for\s+later)?|save\s+that(?:\s+for\s+later)?)\s*[:,-]?\s*(.+)$/is;

function compact(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function titleFromMemory(content: string): string {
  const words = compact(content)
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  const title = words.join(" ");
  return title.length >= 3 ? title.slice(0, 120) : "Explicit chat memory";
}

function classify(content: string): {
  scope: ExplicitMemoryDraft["scope"];
  kind: MemoryKind;
} {
  const text = content.toLowerCase();
  if (/\b(i prefer|my preference|call me|reply|respond)\b/.test(text)) {
    return { scope: "user", kind: "preference" };
  }
  if (/\b(url|https?:\/\/|runbook|linear|jira|notion)\b/.test(text)) {
    return { scope: "repository", kind: "reference" };
  }
  if (/\b(goal|deadline|target|ship by)\b/.test(text)) {
    return { scope: "repository", kind: "goal" };
  }
  if (
    /\b(repo|project|architecture|should|must|decision|workflow|capability)\b/.test(
      text,
    )
  ) {
    return { scope: "repository", kind: "decision" };
  }
  return { scope: "user", kind: "fact" };
}

export function buildExplicitMemoryDraft(
  messageText: string,
): ExplicitMemoryDraft | null {
  const match = EXPLICIT_MEMORY_RE.exec(messageText);
  if (!match) return null;
  const content = compact(match[1]);
  if (content.length < 5) return null;
  const classification = classify(content);
  return {
    ...classification,
    title: titleFromMemory(content),
    summary: content.slice(0, 500),
    body: content,
    reason: "The user explicitly asked Kody to remember this.",
  };
}

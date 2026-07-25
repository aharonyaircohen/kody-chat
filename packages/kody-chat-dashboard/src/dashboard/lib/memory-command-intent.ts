const EXPLICIT_MEMORY_COMMANDS = [
  /^\s*(?:please\s+)?remember\b/iu,
  /^\s*(?:please\s+)?(?:save|store)\s+(?:this|that)\b/iu,
  /^\s*(?:בבקשה\s+)?(?:תזכור|תזכרי|שמור|שמרי)/u,
] as const;

export function hasExplicitMemoryCommand(text: string | null): boolean {
  if (!text) return false;
  return EXPLICIT_MEMORY_COMMANDS.some((pattern) => pattern.test(text));
}

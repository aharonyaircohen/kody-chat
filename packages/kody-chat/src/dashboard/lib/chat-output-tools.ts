export const FINAL_ANSWER_TOOL = "final_answer";
export const SHOW_VIEW_TOOL = "show_view";
export const FINAL_ANSWER_REQUIRES_VIEW_ERROR =
  "final_answer requires show_view for this interactive response. If a renderer rule truly matches this interaction, call show_view with real data from it. If the reply is just conversational (greeting, explanation, open question), call final_answer again with the same content — never invent a demo or placeholder view.";
export const CHAT_OUTPUT_TOOL_NAMES = [
  FINAL_ANSWER_TOOL,
  SHOW_VIEW_TOOL,
] as const;

export interface FinalAnswerOutput {
  content: string;
}

export interface ToolErrorOutput {
  error: string;
}

export function getFinalAnswerContent(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const content = (input as { content?: unknown }).content;
  return typeof content === "string" && content.trim().length > 0
    ? content
    : null;
}

export function isFinalAnswerOutput(
  output: unknown,
): output is FinalAnswerOutput {
  return getFinalAnswerContent(output) !== null;
}

export function getToolErrorMessage(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const error = (output as { error?: unknown }).error;
  return typeof error === "string" && error.trim().length > 0 ? error : null;
}

export function isToolErrorOutput(output: unknown): output is ToolErrorOutput {
  return getToolErrorMessage(output) !== null;
}

export function isFinalAnswerRequiresViewOutput(output: unknown): boolean {
  return getToolErrorMessage(output) === FINAL_ANSWER_REQUIRES_VIEW_ERROR;
}

/**
 * Per-step tool choice. When a step is locked to `show_view` alone, pin
 * the tool by name — some providers (observed: MiniMax-M3) ignore the
 * generic "required" and finish with prose, ending the turn with no
 * visible output. Pinning the specific function is honored far more
 * reliably.
 */
export function selectChatOutputToolChoice<T extends string>(
  activeTools: readonly T[],
): { type: "tool"; toolName: T } | "required" {
  return activeTools.length === 1 && activeTools[0] === SHOW_VIEW_TOOL
    ? { type: "tool", toolName: activeTools[0] }
    : "required";
}

export function selectChatOutputActiveTools<T extends string>({
  toolNames,
  requireViewOutput,
  allowPreRenderTools,
  finalAnswerNeedsView,
}: {
  toolNames: readonly T[];
  requireViewOutput: boolean;
  allowPreRenderTools: boolean;
  finalAnswerNeedsView: boolean;
}): T[] {
  const showViewOnly = toolNames.filter((name) => name === SHOW_VIEW_TOOL);
  // After a rejected final_answer, keep final_answer callable alongside
  // show_view — the nudge is one-shot; locking to show_view only forces
  // the model to fabricate a view (e.g. a demo card for a greeting).
  if (finalAnswerNeedsView) {
    return toolNames.filter(
      (name) => name === SHOW_VIEW_TOOL || name === FINAL_ANSWER_TOOL,
    );
  }
  if (requireViewOutput) {
    return allowPreRenderTools
      ? toolNames.filter((name) => name !== FINAL_ANSWER_TOOL)
      : showViewOnly;
  }
  return [...toolNames];
}

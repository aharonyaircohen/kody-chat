export const FINAL_ANSWER_TOOL = "final_answer";
export const SHOW_VIEW_TOOL = "show_view";
export const CHAT_OUTPUT_CONTRACT_DATA_TYPE = "data-chat-output-contract";
export const EXCLUSIVE_TOOL_OUTPUT_MODE = "exclusive-tool";
export const CHAT_OUTPUT_TOOL_NAMES = [
  FINAL_ANSWER_TOOL,
  SHOW_VIEW_TOOL,
] as const;

const TOOLLESS_RECOVERY_CONTENT =
  "I couldn't complete a reliable answer with this model. Would you like me to retry or use another model?";
const VIEW_RECOVERY_CONTENT =
  "I couldn't display that UI card. Would you like me to retry?";

/** Preserve useful prose when a provider cannot execute the required output tool. */
export function getToollessRecoveryContent(visibleAnswer: string): string {
  const answer = visibleAnswer.trim();
  return answer || TOOLLESS_RECOVERY_CONTENT;
}

export function getViewRecoveryContent(visibleAnswer: string): string {
  const answer = visibleAnswer.trim();
  return answer ? `${answer}\n\nWould you like me to retry?` : VIEW_RECOVERY_CONTENT;
}

export interface FinalAnswerOutput {
  content: string;
}

export interface ToolErrorOutput {
  error: string;
}

export const FINAL_ANSWER_INTERACTION_ERROR =
  "This answer still asks the user for input or a decision. Use show_view with an editable form, choice, or confirmation control instead.";
export const FINAL_ANSWER_FOLLOW_UP_ERROR =
  "This prose answer must end with one short, relevant follow-up question. Retry final_answer without adding or changing a renderer.";

export function finalAnswerEndsWithFollowUpQuestion(content: string): boolean {
  return /\?\s*$/.test(content.trim());
}

/** A final answer cannot be final when it still asks the user to act. */
export function finalAnswerRequestsInteraction(content: string): boolean {
  const text = content.trim();
  return (
    /\b(?:would|could|can|do|will) you\s+(?:approve|confirm|choose|select|provide|share|pick|enter|upload|submit|authorize)\b[^.!?]{0,180}\?/i.test(
      text,
    ) ||
    /\bif you (?:can )?(?:provide|share|choose|select|confirm|approve|pick|enter)\b/i.test(
      text,
    ) ||
    /(?:^|[.!?]\s+)(?:please\s+)?(?:provide|share|choose|select|confirm|approve|pick|enter)\b/i.test(
      text,
    ) ||
    /\b(?:let me know|tell me)\b/i.test(text)
  );
}

/**
 * Direct-chat output policy sent before model chunks.
 *
 * In exclusive-tool mode, provider text deltas are draft material. Exactly
 * one output tool owns the visible reply: `final_answer` commits text and
 * `show_view` commits a rendered view. This prevents an already-visible draft
 * from disappearing when the model selects a renderer later in the turn.
 */
export interface ChatOutputContract {
  mode: typeof EXCLUSIVE_TOOL_OUTPUT_MODE;
}

export function isExclusiveToolOutputContract(
  value: unknown,
): value is ChatOutputContract {
  if (!value || typeof value !== "object") return false;
  return (value as { mode?: unknown }).mode === EXCLUSIVE_TOOL_OUTPUT_MODE;
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

type ToolResultStep = Readonly<{
  toolResults: readonly Readonly<{ toolName: string; output: unknown }>[];
}>;

export function hasSuccessfulRenderedViewResult(
  steps: readonly ToolResultStep[],
): boolean {
  return (
    steps
      .at(-1)
      ?.toolResults.some((result) => isRenderedViewDirective(result.output)) ??
    false
  );
}

export function hasVisibleChatToolOutput(
  steps: readonly ToolResultStep[],
): boolean {
  return steps.some((step) =>
    step.toolResults.some(
      (result) =>
        isRenderedViewDirective(result.output) ||
        ((result.toolName === SHOW_VIEW_TOOL ||
          result.toolName === FINAL_ANSWER_TOOL) &&
          !isToolErrorOutput(result.output)),
    ),
  );
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
  capabilities: {
    supportsRequiredToolChoice?: boolean;
    supportsNamedToolChoice?: boolean;
  } = {},
): { type: "tool"; toolName: T } | "required" | "auto" {
  const supportsRequired = capabilities.supportsRequiredToolChoice !== false;
  const supportsNamed = capabilities.supportsNamedToolChoice !== false;

  if (
    supportsNamed &&
    activeTools.length === 1 &&
    activeTools[0] === SHOW_VIEW_TOOL
  ) {
    return { type: "tool", toolName: activeTools[0] };
  }

  return supportsRequired ? "required" : "auto";
}

export function selectChatOutputActiveTools<T extends string>({
  toolNames,
  requireViewOutput,
  allowPreRenderTools,
}: {
  toolNames: readonly T[];
  requireViewOutput: boolean;
  allowPreRenderTools: boolean;
}): T[] {
  const showViewOnly = toolNames.filter((name) => name === SHOW_VIEW_TOOL);
  if (requireViewOutput) {
    return allowPreRenderTools
      ? toolNames.filter((name) => name !== FINAL_ANSWER_TOOL)
      : showViewOnly;
  }
  return [...toolNames];
}

export function shouldRetryToollessTurn({
  producedOutputTool,
  visibleAnswer,
  enforceToolOutput,
  retryCount,
  maxRetries,
}: {
  producedOutputTool: boolean;
  visibleAnswer: string;
  enforceToolOutput: boolean;
  retryCount: number;
  maxRetries: number;
}): boolean {
  if (producedOutputTool || retryCount >= maxRetries) return false;
  return enforceToolOutput || visibleAnswer.length === 0;
}
import { isRenderedViewDirective } from "./chat-ui-actions";

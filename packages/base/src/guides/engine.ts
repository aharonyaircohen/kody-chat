/**
 * @fileType utility
 * @domain guides
 * @pattern guide-engine
 * @ai-summary Pure guide progression: given a guide and a numeric pointer,
 *   what is the current step, and how does an answer advance it. No I/O —
 *   the chat tools wire this to config storage and the user-state pointer.
 *   The model only ever receives the current step, so it cannot skip ahead.
 */
import type { GuideConfig, GuideStep } from "./types";

export interface GuidePosition {
  /** Zero-based index of the current step, clamped to the guide. */
  index: number;
  step: GuideStep | null;
  total: number;
  finished: boolean;
}

export function positionAt(guide: GuideConfig, pointer: number): GuidePosition {
  const total = guide.steps.length;
  const index = Math.max(0, Math.floor(pointer));
  const finished = index >= total;
  return {
    index,
    step: finished ? null : guide.steps[index],
    total,
    finished,
  };
}

/**
 * Decide whether an answer completes the current step. "keyword" steps only
 * pass when the answer contains the keyword; "model" steps are advanced by
 * the model's explicit call (so this returns true — the caller gates on the
 * tool being invoked).
 */
export function answerCompletesStep(step: GuideStep, answer: string): boolean {
  if (step.advance === "keyword") {
    if (!step.keyword) return false;
    return answer.toLowerCase().includes(step.keyword.toLowerCase());
  }
  return true;
}

/** Next pointer after completing the current step (never past the end + 0). */
export function nextPointer(guide: GuideConfig, pointer: number): number {
  const index = Math.max(0, Math.floor(pointer));
  return Math.min(index + 1, guide.steps.length);
}

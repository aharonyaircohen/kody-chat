/**
 * @fileType utility
 * @domain guides
 * @pattern guide-engine
 * @ai-summary Pure guide progression over a runtime-resolved step list
 *   (steps come from the brand's CMS, mapped by the caller). The pointer is
 *   the current step's ID (drift-safe across CMS reorders/edits), or the
 *   GUIDE_FINISHED sentinel. No I/O; the chat tools resolve steps and wire
 *   the pointer to user-state. The model only ever receives the current
 *   step, so it cannot skip ahead.
 */
import { GUIDE_FINISHED, type GuideStep } from "./types";

export interface GuidePosition {
  index: number;
  step: GuideStep | null;
  total: number;
  finished: boolean;
}

/**
 * Resolve the current position from a step-id pointer. Empty/unknown pointer
 * → the first step (a student who hasn't started, or whose stored step was
 * removed, begins at the top). GUIDE_FINISHED → finished.
 */
export function currentByPointer(
  steps: readonly GuideStep[],
  pointerId: string | null | undefined,
): GuidePosition {
  const total = steps.length;
  if (pointerId === GUIDE_FINISHED) {
    return { index: total, step: null, total, finished: true };
  }
  if (total === 0) {
    return { index: 0, step: null, total: 0, finished: true };
  }
  const found = pointerId
    ? steps.findIndex((step) => step.id === pointerId)
    : 0;
  const index = found < 0 ? 0 : found;
  return { index, step: steps[index], total, finished: false };
}

/**
 * Whether an answer completes the current step. "keyword" steps only pass
 * when the answer contains the keyword; "model" steps are advanced by the
 * model's explicit call (so this returns true — the caller gates on the
 * tool being invoked).
 */
export function answerCompletesStep(step: GuideStep, answer: string): boolean {
  if (step.advance === "keyword") {
    if (!step.keyword) return false;
    return answer.toLowerCase().includes(step.keyword.toLowerCase());
  }
  return true;
}

/**
 * The pointer after completing the current step: the next step's id, or
 * GUIDE_FINISHED when there is none.
 */
export function nextPointerId(
  steps: readonly GuideStep[],
  pointerId: string | null | undefined,
): string {
  const pos = currentByPointer(steps, pointerId);
  if (pos.finished) return GUIDE_FINISHED;
  const next = steps[pos.index + 1];
  return next ? next.id : GUIDE_FINISHED;
}

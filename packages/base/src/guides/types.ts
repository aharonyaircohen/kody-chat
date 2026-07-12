/**
 * @fileType types
 * @domain guides
 * @pattern guide-contract
 * @ai-summary A guide is an ordered list of teaching steps that guide the
 *   chat model one step at a time. Authored per brand, stored as config; the
 *   engine hands the model only the current step and moves a per-student
 *   pointer forward — the model teaches, kody controls progression.
 */
import { z } from "zod";

export const GUIDE_ADVANCE_MODES = ["model", "keyword"] as const;

export const guideStepSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
    title: z.string().trim().min(1).max(200),
    /** What the model should teach / ask on this step. */
    instruction: z.string().trim().min(1).max(4000),
    /**
     * How the step completes: "model" — the model calls guide_advance when
     * it judges the learner is ready; "keyword" — kody only advances when the
     * learner's answer contains `keyword` (case-insensitive).
     */
    advance: z.enum(GUIDE_ADVANCE_MODES).default("model"),
    keyword: z.string().trim().max(200).optional(),
  })
  .strict();

export const guideConfigSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).default(""),
    enabled: z.boolean().default(true),
    steps: z.array(guideStepSchema).min(1).max(100),
  })
  .strict();

export type GuideStep = z.infer<typeof guideStepSchema>;
export type GuideConfig = z.infer<typeof guideConfigSchema>;

/** The per-student pointer key inside the user-state `progress` namespace. */
export function guidePointerKey(slug: string): string {
  return `guide:${slug}:step`;
}

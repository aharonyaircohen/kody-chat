/**
 * @fileType types
 * @domain guides
 * @pattern guide-contract
 * @ai-summary A guide is a thin progression layer over a CMS collection: it
 *   names the collection whose documents ARE the ordered steps and how to
 *   read them, plus how a step advances. It stores NO step content — the
 *   steps live only in the brand's CMS (e.g. MongoDB) and are read fresh
 *   each turn, so there is no duplicate data. The chat model teaches one
 *   step at a time; kody owns progression.
 */
import { z } from "zod";

export const GUIDE_ADVANCE_MODES = ["model", "keyword"] as const;

/** Pointer sentinel meaning the student finished the guide. */
export const GUIDE_FINISHED = "__guide_finished__";

/**
 * How a guide reads its steps from a CMS collection. Field mappings default
 * to conventional names so a well-shaped collection needs no configuration.
 */
export const guideSourceSchema = z
  .object({
    /** CMS collection whose documents are the ordered steps. */
    collection: z.string().trim().min(1),
    /** Field the steps are sorted by (ascending). */
    orderField: z.string().trim().min(1).default("order"),
    /** Field holding each step's stable id (falls back to the CMS _id/id). */
    idField: z.string().trim().min(1).default("id"),
    /** Field holding the step's short title. */
    titleField: z.string().trim().min(1).default("title"),
    /** Field holding what the model should teach / ask on the step. */
    instructionField: z.string().trim().min(1).default("instruction"),
    /** Optional per-step advance-mode field ("model" | "keyword"). */
    advanceField: z.string().trim().min(1).optional(),
    /** Optional per-step keyword field (for keyword-gated steps). */
    keywordField: z.string().trim().min(1).optional(),
    /** Default advance mode when a step has no advanceField value. */
    defaultAdvance: z.enum(GUIDE_ADVANCE_MODES).default("model"),
  })
  .strict();

export const guideConfigSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).default(""),
    enabled: z.boolean().default(true),
    source: guideSourceSchema,
  })
  .strict();

export type GuideSource = z.infer<typeof guideSourceSchema>;
export type GuideConfig = z.infer<typeof guideConfigSchema>;

/** A step resolved from a CMS document at runtime (never stored by kody). */
export interface GuideStep {
  id: string;
  title: string;
  instruction: string;
  advance: (typeof GUIDE_ADVANCE_MODES)[number];
  keyword?: string;
}

/** The per-student pointer key inside the user-state `progress` namespace. */
export function guidePointerKey(slug: string): string {
  return `guide:${slug}:step`;
}

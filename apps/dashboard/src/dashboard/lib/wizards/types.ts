/**
 * @fileType types
 * @domain wizards
 * @pattern wizard-definition
 * @ai-summary Declarative setup-wizard contract. A wizard is DATA — an
 *   ordered list of steps the generic WizardRunner renders. Step types:
 *   `instructions` (markdown-ish text), `collect-variable` (input saved to
 *   /variables), `collect-secret` (input saved to the /secrets vault), and
 *   `check` (server probe via /api/kody/wizards/check that must pass).
 *   Definitions must be JSON-serializable (server page → client component).
 */
import { z } from "zod";

export const wizardStepSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("instructions"),
    id: z.string().min(1),
    title: z.string().min(1),
    body: z.string().min(1),
    /** Optional external link (e.g. provider console). */
    href: z.string().url().optional(),
  }),
  z.object({
    type: z.literal("collect-variable"),
    id: z.string().min(1),
    title: z.string().min(1),
    /** /variables name, e.g. GOOGLE_CLIENT_ID. */
    name: z.string().regex(/^[A-Z][A-Z0-9_]{0,127}$/),
    hint: z.string().optional(),
    placeholder: z.string().optional(),
  }),
  z.object({
    type: z.literal("collect-secret"),
    id: z.string().min(1),
    title: z.string().min(1),
    /** /secrets vault name, e.g. GOOGLE_CLIENT_SECRET. */
    name: z.string().regex(/^[A-Z][A-Z0-9_]{0,127}$/),
    hint: z.string().optional(),
  }),
  z.object({
    type: z.literal("check"),
    id: z.string().min(1),
    title: z.string().min(1),
    /** Server-side probe id resolved by the wizard check registry. */
    checkId: z.string().min(1),
    /** Params forwarded to the probe (JSON-serializable). */
    params: z.record(z.string(), z.string()).optional(),
    hint: z.string().optional(),
  }),
]);

export const wizardDefinitionSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  title: z.string().min(1),
  description: z.string().min(1),
  steps: z.array(wizardStepSchema).min(1),
});

export type WizardStep = z.infer<typeof wizardStepSchema>;
export type WizardDefinition = z.infer<typeof wizardDefinitionSchema>;

export function validateWizardDefinition(input: unknown): WizardDefinition {
  const result = wizardDefinitionSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Invalid wizard definition: ${result.error.issues[0]?.message ?? "validation failed"}`,
    );
  }
  const ids = result.data.steps.map((step) => step.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Invalid wizard definition: duplicate step ids");
  }
  return result.data;
}

/**
 * @fileType types
 * @domain triggers
 * @pattern trigger-contract
 * @ai-summary The trigger contract: a configurable rule that reacts to a
 *   system event ("when event X matches, save mapped payload values to
 *   user-state entity Y"). Triggers are brand config in the state repo;
 *   the event catalog and this engine are kody code.
 */
import { z } from "zod";

export const TRIGGER_CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "exists",
] as const;

export const triggerConditionSchema = z
  .object({
    /** Dot path into the event payload, e.g. "viewId". */
    path: z.string().trim().min(1).max(200),
    op: z.enum(TRIGGER_CONDITION_OPERATORS),
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  })
  .strict();

export const triggerActionSchema = z
  .object({
    type: z.literal("save-user-state"),
    /** Target user-state namespace (entity). */
    namespace: z.string().trim().min(1),
    /**
     * "append" (default) keeps a growing list per key (event history);
     * "merge" overwrites each mapped key with the latest value. Advanced
     * config only — the UI doesn't expose it.
     */
    mode: z.enum(["merge", "append"]).default("append"),
    /**
     * Target key → source. `payload.<path>` copies from the event payload;
     * `literal:<value>` stores a fixed string; `event.name` /
     * `event.occurredAt` / `event.sessionId` copy envelope fields.
     * An empty map (the default) saves the whole event payload as-is.
     */
    map: z.record(z.string().min(1), z.string().min(1)).default({}),
  })
  .strict();

export const triggerConfigSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    name: z.string().trim().min(1).max(120),
    enabled: z.boolean().default(true),
    event: z.string().trim().min(1),
    conditions: z.array(triggerConditionSchema).max(10).default([]),
    action: triggerActionSchema,
  })
  .strict();

export const triggersFileSchema = z
  .object({
    version: z.literal(1).default(1),
    triggers: z.array(triggerConfigSchema).max(200).default([]),
  })
  .strict();

export type TriggerCondition = z.infer<typeof triggerConditionSchema>;
export type TriggerAction = z.infer<typeof triggerActionSchema>;
export type TriggerConfig = z.infer<typeof triggerConfigSchema>;
export type TriggersFile = z.infer<typeof triggersFileSchema>;

/**
 * @fileType utility
 * @domain guided-flows
 * @pattern stored-definition-codec
 * @ai-summary Shared parsing for custom GuidedFlow definitions persisted in
 *   userState (namespace "guided-flow-definitions"). Used by the guided-flows
 *   route and the chat tools so both resolve the same custom flows.
 */
import { z } from "zod";

import type { GuidedFlowDefinition } from "./controller";
import { migrateLegacyGuidedFlowDefinition } from "./authoring";

export const GUIDED_FLOW_DEFINITIONS_NAMESPACE = "guided-flow-definitions";

export type StoredGuidedFlowDefinition = GuidedFlowDefinition & {
  readonly archived?: boolean;
};

export const storedGuidedFlowDefinitionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  version: z.number().int().positive(),
  title: z.string().trim().min(1).max(160),
  completionRouteId: z.string().trim().max(80).optional(),
  archived: z.boolean().optional(),
  steps: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(80),
        title: z.string().trim().min(1).max(160),
        explanation: z.string().trim().min(1).max(1_000),
        rendererSlug: z.string().trim().min(1).max(80),
        rendererData: z.record(z.string(), z.unknown()).optional(),
        authoringGoal: z.string().trim().max(1_000).optional(),
        routeId: z.string().trim().max(80).optional(),
        transitions: z.record(z.string(), z.string()).optional(),
        allowedActions: z.array(z.string().trim().min(1).max(80)).optional(),
      }),
    )
    .min(1)
    .max(20),
});

/** Parse a userState payload into valid stored definitions, skipping bad rows. */
export function parseStoredGuidedFlowDefinitions(
  data: unknown,
): StoredGuidedFlowDefinition[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((candidate) => {
    const parsed = storedGuidedFlowDefinitionSchema.safeParse(candidate);
    return parsed.success
      ? [
          migrateLegacyGuidedFlowDefinition(
            parsed.data as StoredGuidedFlowDefinition,
          ),
        ]
      : [];
  });
}

/**
 * Map guidedFlowDefinitions table rows to stored definitions. The row's
 * version/archived are authoritative; the payload carries the flow shape.
 */
export function parseGuidedFlowDefinitionRows(
  rows: unknown,
): StoredGuidedFlowDefinition[] {
  if (!Array.isArray(rows)) return [];
  return parseStoredGuidedFlowDefinitions(
    rows.flatMap((row) => {
      const record = row as {
        version?: number;
        archived?: boolean;
        definition?: unknown;
      } | null;
      if (!record?.definition || typeof record.definition !== "object") {
        return [];
      }
      return [
        {
          ...(record.definition as Record<string, unknown>),
          version: record.version,
          ...(record.archived ? { archived: true } : {}),
        },
      ];
    }),
  );
}

/** Latest version per flow id, including archived tombstones. */
export function latestStoredGuidedFlowDefinitions(
  definitions: readonly StoredGuidedFlowDefinition[],
): StoredGuidedFlowDefinition[] {
  const latest = new Map<string, StoredGuidedFlowDefinition>();
  for (const definition of definitions) {
    const current = latest.get(definition.id);
    if (!current || definition.version > current.version) {
      latest.set(definition.id, definition);
    }
  }
  return [...latest.values()];
}

/** Latest non-archived definitions — the flows a user may start. */
export function latestAvailableGuidedFlowDefinitions(
  definitions: readonly StoredGuidedFlowDefinition[],
): GuidedFlowDefinition[] {
  return latestStoredGuidedFlowDefinitions(definitions).filter(
    (definition) => !definition.archived,
  );
}

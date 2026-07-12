/**
 * Durable state written by observation and operating loops.
 * These are agency records, not new execution primitives.
 */
import { z } from "zod";

const IdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const TimestampSchema = z.string().datetime({ offset: true });
const ShortTextSchema = z.string().trim().min(1).max(500);

export const ObservationEvidenceSchema = z
  .object({
    kind: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(300),
    status: z.string().trim().min(1).max(80).optional(),
    url: z.string().url().max(2_000).optional(),
    value: z.union([z.string().max(2_000), z.number(), z.boolean()]).optional(),
  })
  .strict();

export const ObservationSchema = z
  .object({
    version: z.literal(1),
    id: IdSchema,
    observerId: IdSchema,
    capability: IdSchema,
    subject: IdSchema,
    status: z.enum(["healthy", "unhealthy", "unknown"]),
    summary: ShortTextSchema,
    evidence: z.array(ObservationEvidenceSchema).max(100).default([]),
    observedAt: TimestampSchema,
    expiresAt: TimestampSchema.optional(),
  })
  .strict();

export type Observation = z.infer<typeof ObservationSchema>;

export const FindingSchema = z
  .object({
    version: z.literal(1),
    id: IdSchema,
    observerId: IdSchema,
    subject: IdSchema,
    title: ShortTextSchema,
    expectation: ShortTextSchema,
    actual: ShortTextSchema,
    severity: z.enum(["low", "medium", "high", "critical"]),
    status: z.enum(["open", "in_progress", "resolved", "dismissed"]),
    phase: z.enum([
      "observed",
      "deciding",
      "delivering",
      "verifying",
      "learning",
      "closed",
    ]),
    observationIds: z.array(IdSchema).min(1).max(100),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    resolvedAt: TimestampSchema.optional(),
    decision: ShortTextSchema.optional(),
    deliveryRunId: IdSchema.optional(),
    learningIds: z.array(IdSchema).max(100).optional(),
  })
  .strict();

export type Finding = z.infer<typeof FindingSchema>;

export const LearningSchema = z
  .object({
    version: z.literal(1),
    id: IdSchema,
    findingId: IdSchema,
    summary: ShortTextSchema,
    change: z
      .object({
        kind: z.enum([
          "memory",
          "intent",
          "goal",
          "loop",
          "agent",
          "capability",
          "workflow",
          "configuration",
        ]),
        target: IdSchema,
        description: ShortTextSchema,
      })
      .strict(),
    evidence: z.array(z.string().trim().min(1).max(500)).max(100),
    createdAt: TimestampSchema,
  })
  .strict();

export type Learning = z.infer<typeof LearningSchema>;

function findingId(subject: string): string {
  const safe = subject
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
  return `finding-${safe}`;
}

export function reconcileFinding({
  previous,
  observation: rawObservation,
  expectation,
  severity,
}: {
  previous?: Finding;
  observation: Observation;
  expectation: string;
  severity: Finding["severity"];
}): Finding | null {
  const observation = ObservationSchema.parse(rawObservation);
  if (!previous && observation.status === "healthy") return null;
  const observationIds = Array.from(
    new Set([...(previous?.observationIds ?? []), observation.id]),
  ).slice(-100);
  const healthy = observation.status === "healthy";
  const shouldReopen =
    !healthy &&
    (previous?.phase === "verifying" ||
      previous?.phase === "closed" ||
      previous?.status === "resolved");
  const createdAt = previous?.createdAt ?? observation.observedAt;

  return FindingSchema.parse({
    version: 1,
    id: previous?.id ?? findingId(observation.subject),
    observerId: observation.observerId,
    subject: observation.subject,
    title: previous?.title ?? observation.summary,
    expectation,
    actual: observation.summary,
    severity,
    status: healthy
      ? "in_progress"
      : shouldReopen
        ? "open"
        : (previous?.status ?? "open"),
    phase: healthy
      ? "verifying"
      : shouldReopen
        ? "observed"
        : (previous?.phase ?? "observed"),
    observationIds,
    createdAt,
    updatedAt: observation.observedAt,
    ...(previous?.decision ? { decision: previous.decision } : {}),
    ...(previous?.deliveryRunId
      ? { deliveryRunId: previous.deliveryRunId }
      : {}),
    ...(previous?.learningIds ? { learningIds: previous.learningIds } : {}),
  });
}

export type AgencyStateModel = "observations" | "findings" | "learnings";

export function agencyStateSchema(model: AgencyStateModel) {
  if (model === "observations") return ObservationSchema;
  if (model === "findings") return FindingSchema;
  return LearningSchema;
}

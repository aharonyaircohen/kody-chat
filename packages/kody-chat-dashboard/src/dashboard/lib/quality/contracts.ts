import { z } from "zod";

export const qualityStatusSchema = z.enum(["draft", "active", "archived"]);
export const qualityPrioritySchema = z.enum(["critical", "high", "normal"]);
export const scenarioKindSchema = z.enum([
  "happy",
  "validation",
  "permission",
  "failure",
  "recovery",
  "persistence",
]);
export const qualityRunStatusSchema = z.enum([
  "queued",
  "running",
  "passed",
  "failed",
  "blocked",
  "cancelled",
]);

const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const timestampSchema = z.string().datetime();

const stepText = z.string().trim().min(1).max(500);
export const qualityStepSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("open"),
    path: z.string().trim().min(1).max(2048),
  }),
  z.object({ operation: z.literal("click"), target: stepText }),
  z.object({
    operation: z.literal("fill"),
    target: stepText,
    value: z.string().max(4000),
  }),
  z.object({ operation: z.literal("reload") }),
  z.object({ operation: z.literal("check"), text: stepText }),
]);

export const actionSchema = z
  .object({
    slug: slugSchema,
    name: z.string().trim().min(1).max(160),
    outcome: z.string().trim().min(1).max(2000),
    area: z.string().trim().min(1).max(120),
    steps: z.array(qualityStepSchema).min(1).max(50).optional(),
    status: qualityStatusSchema,
    updatedAt: timestampSchema,
  })
  .superRefine((action, context) => {
    if (action.status === "active" && !action.steps?.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["steps"],
        message: "Active Actions require executable steps",
      });
    }
  });

export const journeySchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(160),
  goal: z.string().trim().min(1).max(2000),
  priority: qualityPrioritySchema,
  status: qualityStatusSchema,
  actionSlugs: z.array(slugSchema).max(100),
  updatedAt: timestampSchema,
});

export const scenarioSchema = z
  .object({
    slug: slugSchema,
    journeySlug: slugSchema,
    name: z.string().trim().min(1).max(160),
    kind: scenarioKindSchema,
    given: z.string().trim().min(1).max(4000),
    expectedVisible: z.string().trim().min(1).max(4000),
    expectedState: z.string().trim().min(1).max(4000),
    environmentId: slugSchema.optional(),
    testId: slugSchema.optional(),
    cleanup: z.string().trim().max(4000).optional(),
    status: qualityStatusSchema,
    updatedAt: timestampSchema,
  })
  .superRefine((scenario, context) => {
    if (scenario.status === "active" && !scenario.environmentId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["environmentId"],
        message: "Active Scenarios require a repository environment",
      });
    }
  });

export type QualityAction = z.infer<typeof actionSchema>;
export type QualityStep = z.infer<typeof qualityStepSchema>;
export type QualityJourney = z.infer<typeof journeySchema>;
export type QualityScenario = z.infer<typeof scenarioSchema>;
export type QualityRunStatus = z.infer<typeof qualityRunStatusSchema>;
export type QualityHealth =
  | "uncovered"
  | "never_run"
  | "running"
  | "passing"
  | "failing"
  | "blocked"
  | "stale";

export function qualityRunHealth(input: {
  scenarioStatus: QualityScenario["status"];
  scenarioUpdatedAt: string;
  latestRun: {
    status: QualityRunStatus;
    definitionUpdatedAt: string;
    sourceCommit: string;
  } | null;
  targetCommit?: string | null;
  hasTest?: boolean;
}): QualityHealth {
  if (input.scenarioStatus === "active" && input.hasTest === false) {
    return "uncovered";
  }
  if (!input.latestRun) return "never_run";
  if (
    input.scenarioUpdatedAt > input.latestRun.definitionUpdatedAt ||
    (input.targetCommit && input.latestRun.sourceCommit !== input.targetCommit)
  ) {
    return "stale";
  }
  if (
    input.latestRun.status === "queued" ||
    input.latestRun.status === "running"
  ) {
    return "running";
  }
  if (input.latestRun.status === "passed") return "passing";
  if (input.latestRun.status === "blocked") return "blocked";
  if (input.latestRun.status === "failed") return "failing";
  return "never_run";
}

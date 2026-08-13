import { z } from "zod";

export const agencyRequestStateSchema = z
  .object({
    phase: z.enum([
      "assessing",
      "waiting-information",
      "waiting-approval",
      "running",
      "monitoring",
      "done",
      "blocked",
    ]),
    source: z
      .object({
        kind: z.literal("guided-flow"),
        instanceId: z.string().trim().min(1).max(200),
        effectId: z.string().trim().min(1).max(300),
      })
      .strict(),
    requirement: z
      .object({
        outcome: z.string().trim().min(1).max(20_000),
        activation: z.string().trim().min(1).max(20_000).optional(),
        permissions: z.string().trim().min(1).max(20_000).optional(),
        success: z.string().trim().min(1).max(20_000).optional(),
        context: z.string().trim().min(1).max(20_000).optional(),
      })
      .strict(),
    questions: z.array(z.string().trim().min(1).max(2_000)).max(20),
    plan: z.array(z.string().trim().min(1).max(2_000)).max(50),
    related: z
      .array(
        z
          .object({
            kind: z.enum([
              "solution",
              "trigger",
              "loop",
              "workflow",
              "capability",
              "run",
            ]),
            id: z.string().trim().min(1).max(200),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();

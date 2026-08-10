import { z } from "zod";

const actionResultSchema = z
  .object({
    actionSlug: z.string().trim().min(1).max(80),
    actionName: z.string().trim().min(1).max(160),
    status: z.enum(["passed", "failed", "blocked"]),
    evidence: z.string().trim().min(1).max(2000),
    artifactPath: z.string().trim().min(1).max(2048),
  })
  .strict();

const scenarioResultSchema = z
  .object({
    status: z.enum(["passed", "failed", "blocked"]),
    evidence: z.string().trim().min(1).max(2000),
    artifactPath: z.string().trim().min(1).max(2048),
  })
  .strict();

const resultSchema = z.object({
  actionResults: z.array(actionResultSchema).min(1).max(100),
  scenarioResult: scenarioResultSchema,
});

type ResultStatus = "passed" | "failed" | "blocked";

export function verifyQualityResult(
  output: Record<string, unknown>,
  runId: string,
  expectedActions: Array<{ slug: string; name: string }>,
) {
  const parsed = resultSchema.safeParse(output);
  if (!parsed.success) {
    return {
      result: null,
      error:
        "Quality result is missing the required Action or Scenario results.",
    } as const;
  }
  if (parsed.data.actionResults.length !== expectedActions.length) {
    return {
      result: null,
      error: `Quality result reported ${parsed.data.actionResults.length} Actions, but the Journey contains ${expectedActions.length}.`,
    } as const;
  }

  const evidencePrefix = `test-results/quality-runs/${runId}/`;
  for (const [index, result] of parsed.data.actionResults.entries()) {
    const expected = expectedActions[index];
    if (
      !expected ||
      !result.artifactPath.startsWith(evidencePrefix)
    ) {
      return {
        result: null,
        error: `Quality evidence for Action ${index + 1} is not inside this run.`,
      } as const;
    }
  }
  if (!parsed.data.scenarioResult.artifactPath.startsWith(evidencePrefix)) {
    return {
      result: null,
      error: "Quality evidence for the Scenario is not inside this run.",
    } as const;
  }

  const passed = parsed.data.actionResults.filter(
    (result) => result.status === "passed",
  ).length;
  const failed = parsed.data.actionResults.filter(
    (result) => result.status === "failed",
  ).length;
  const blocked = parsed.data.actionResults.filter(
    (result) => result.status === "blocked",
  ).length;
  const statuses = [
    ...parsed.data.actionResults.map((result) => result.status),
    parsed.data.scenarioResult.status,
  ];
  const status: ResultStatus = statuses.includes("failed")
    ? "failed"
    : statuses.includes("blocked")
      ? "blocked"
      : "passed";

  const actionResults = parsed.data.actionResults.map((result, index) => ({
    ...result,
    actionSlug: expectedActions[index]!.slug,
    actionName: expectedActions[index]!.name,
  }));

  return {
    result: {
      ...parsed.data,
      actionResults,
      passed,
      failed,
      blocked,
      status,
    },
    error: null,
  } as const;
}

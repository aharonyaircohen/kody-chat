import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { setup } from "./helpers";

const TENANT = "acme/app";
const NOW = "2026-08-08T00:00:00.000Z";

describe("pipeline runs", () => {
  it("allows only one running Pipeline for the same concurrency key", async () => {
    const t = setup();
    const common = {
      tenantId: TENANT,
      pipelineId: "ci-repair",
      concurrencyKey: "main",
      facts: { branch: "main" },
      steps: [
        { id: "repair", workflowId: "ci-repair", status: "pending" as const },
      ],
      now: NOW,
    };

    const first = await t.mutation(api.pipelineRuns.reserve, {
      ...common,
      runId: "repair-1",
    });
    const competing = await t.mutation(api.pipelineRuns.reserve, {
      ...common,
      runId: "repair-2",
    });
    const otherBranch = await t.mutation(api.pipelineRuns.reserve, {
      ...common,
      runId: "repair-feature",
      concurrencyKey: "feature",
      facts: { branch: "feature" },
    });

    expect(first.claimed).toBe(true);
    expect(competing.claimed).toBe(false);
    expect(competing.run?.runId).toBe("repair-1");
    expect(otherBranch.claimed).toBe(true);
  });

  it("releases a concurrency key held by an abandoned run", async () => {
    const t = setup();
    const common = {
      tenantId: TENANT,
      pipelineId: "ci-repair",
      concurrencyKey: "main",
      facts: { branch: "main" },
      steps: [
        { id: "repair", workflowId: "ci-repair", status: "pending" as const },
      ],
    };
    await t.mutation(api.pipelineRuns.reserve, {
      ...common,
      runId: "abandoned-repair",
      now: "2026-08-08T00:00:00.000Z",
    });

    const replacement = await t.mutation(api.pipelineRuns.reserve, {
      ...common,
      runId: "replacement-repair",
      now: "2026-08-08T08:00:00.000Z",
    });

    expect(replacement.claimed).toBe(true);
    const abandoned = await t.query(api.pipelineRuns.get, {
      tenantId: TENANT,
      pipelineId: "ci-repair",
      runId: "abandoned-repair",
    });
    expect(abandoned?.status).toBe("failed");
    expect(abandoned?.error).toBe("Pipeline run expired while still active.");
  });

  it("reserves once, advances in order, and ignores duplicate completions", async () => {
    const t = setup();
    const args = {
      tenantId: TENANT,
      pipelineId: "review-and-merge",
      runId: "run-1",
      facts: { pr: 42 },
      steps: [
        {
          id: "review",
          workflowId: "review-fix",
          status: "pending" as const,
        },
        { id: "merge", workflowId: "merge", status: "pending" as const },
      ],
      now: NOW,
    };

    const first = await t.mutation(api.pipelineRuns.reserve, args);
    const duplicate = await t.mutation(api.pipelineRuns.reserve, args);
    expect(first.claimed).toBe(true);
    expect(duplicate.claimed).toBe(false);

    await t.mutation(api.pipelineRuns.markDispatched, {
      tenantId: TENANT,
      pipelineId: args.pipelineId,
      runId: args.runId,
      stepIndex: 0,
      workflowRunId: "workflow-run-1",
      now: NOW,
    });
    const next = await t.mutation(api.pipelineRuns.advance, {
      tenantId: TENANT,
      workflowRunId: "workflow-run-1",
      status: "success",
      output: { pr: 42, headSha: "abc" },
      now: NOW,
    });
    expect(next).toMatchObject({
      kind: "next",
      stepIndex: 1,
      facts: { pr: 42, headSha: "abc" },
    });
    const advanced = await t.query(api.pipelineRuns.get, {
      tenantId: TENANT,
      pipelineId: args.pipelineId,
      runId: args.runId,
    });
    expect(advanced?.facts).toEqual({ pr: 42, headSha: "abc" });
    await expect(
      t.mutation(api.pipelineRuns.advance, {
        tenantId: TENANT,
        workflowRunId: "workflow-run-1",
        status: "success",
        output: {},
        now: NOW,
      }),
    ).resolves.toBeNull();
  });

  it("stops the Pipeline when a child Workflow fails", async () => {
    const t = setup();
    await t.mutation(api.pipelineRuns.reserve, {
      tenantId: TENANT,
      pipelineId: "review-and-merge",
      runId: "run-failed",
      facts: { pr: 42 },
      steps: [{ id: "review", workflowId: "review-fix", status: "pending" }],
      now: NOW,
    });
    await t.mutation(api.pipelineRuns.markDispatched, {
      tenantId: TENANT,
      pipelineId: "review-and-merge",
      runId: "run-failed",
      stepIndex: 0,
      workflowRunId: "workflow-run-failed",
      now: NOW,
    });

    const result = await t.mutation(api.pipelineRuns.advance, {
      tenantId: TENANT,
      workflowRunId: "workflow-run-failed",
      status: "failed",
      output: {},
      now: NOW,
    });
    expect(result).toEqual({ kind: "failed" });
    const run = await t.query(api.pipelineRuns.get, {
      tenantId: TENANT,
      pipelineId: "review-and-merge",
      runId: "run-failed",
    });
    expect(run?.status).toBe("failed");
    expect(run?.steps[0]?.status).toBe("failed");
  });

  it("marks a Pipeline blocked instead of leaving it running forever", async () => {
    const t = setup();
    await t.mutation(api.pipelineRuns.reserve, {
      tenantId: TENANT,
      pipelineId: "review-and-merge",
      runId: "run-blocked",
      facts: { pr: 42 },
      steps: [{ id: "review", workflowId: "review-fix", status: "pending" }],
      now: NOW,
    });
    await t.mutation(api.pipelineRuns.markDispatched, {
      tenantId: TENANT,
      pipelineId: "review-and-merge",
      runId: "run-blocked",
      stepIndex: 0,
      workflowRunId: "workflow-run-blocked",
      now: NOW,
    });

    await expect(
      t.mutation(api.pipelineRuns.advance, {
        tenantId: TENANT,
        workflowRunId: "workflow-run-blocked",
        status: "blocked",
        output: {},
        now: NOW,
      }),
    ).resolves.toEqual({ kind: "blocked" });
    const run = await t.query(api.pipelineRuns.get, {
      tenantId: TENANT,
      pipelineId: "review-and-merge",
      runId: "run-blocked",
    });
    expect(run?.status).toBe("blocked");
  });
});

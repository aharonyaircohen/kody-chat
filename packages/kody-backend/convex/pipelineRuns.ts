import { v } from "convex/values";
import { pipelineRunStepValidator } from "./validators";
import { serviceMutation, serviceQuery } from "./lib/auth";

export const list = serviceQuery({
  args: {
    tenantId: v.string(),
    pipelineId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { tenantId, pipelineId, limit }) =>
    await ctx.db
      .query("pipelineRuns")
      .withIndex("by_pipeline", (q) =>
        q.eq("tenantId", tenantId).eq("pipelineId", pipelineId),
      )
      .order("desc")
      .take(Math.min(Math.max(limit ?? 20, 1), 100)),
});

export const get = serviceQuery({
  args: { tenantId: v.string(), pipelineId: v.string(), runId: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("pipelineRuns")
      .withIndex("by_run", (q) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("pipelineId", args.pipelineId)
          .eq("runId", args.runId),
      )
      .unique(),
});

export const reserve = serviceMutation({
  args: {
    tenantId: v.string(),
    pipelineId: v.string(),
    runId: v.string(),
    facts: v.optional(v.record(v.string(), v.any())),
    input: v.optional(v.record(v.string(), v.any())),
    steps: v.array(pipelineRunStepValidator),
    now: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pipelineRuns")
      .withIndex("by_run", (q) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("pipelineId", args.pipelineId)
          .eq("runId", args.runId),
      )
      .unique();
    if (existing) return { claimed: false, run: existing };
    const id = await ctx.db.insert("pipelineRuns", {
      tenantId: args.tenantId,
      pipelineId: args.pipelineId,
      runId: args.runId,
      status: "running",
      facts: args.facts ?? args.input ?? {},
      steps: args.steps,
      currentStepIndex: 0,
      createdAt: args.now,
      updatedAt: args.now,
    });
    return { claimed: true, run: await ctx.db.get(id) };
  },
});

export const markDispatched = serviceMutation({
  args: {
    tenantId: v.string(),
    pipelineId: v.string(),
    runId: v.string(),
    stepIndex: v.number(),
    workflowRunId: v.string(),
    now: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("pipelineRuns")
      .withIndex("by_run", (q) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("pipelineId", args.pipelineId)
          .eq("runId", args.runId),
      )
      .unique();
    if (
      !run ||
      run.status !== "running" ||
      run.currentStepIndex !== args.stepIndex ||
      !run.steps[args.stepIndex]
    ) {
      return false;
    }
    const steps = [...run.steps];
    steps[args.stepIndex] = {
      ...steps[args.stepIndex]!,
      status: "running",
      workflowRunId: args.workflowRunId,
      startedAt: args.now,
    };
    await ctx.db.patch(run._id, {
      steps,
      activeWorkflowRunId: args.workflowRunId,
      updatedAt: args.now,
    });
    return true;
  },
});

export const failDispatch = serviceMutation({
  args: {
    tenantId: v.string(),
    pipelineId: v.string(),
    runId: v.string(),
    error: v.string(),
    now: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("pipelineRuns")
      .withIndex("by_run", (q) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("pipelineId", args.pipelineId)
          .eq("runId", args.runId),
      )
      .unique();
    if (!run || run.status !== "running") return false;
    const steps = [...run.steps];
    if (steps[run.currentStepIndex]) {
      steps[run.currentStepIndex] = {
        ...steps[run.currentStepIndex]!,
        status: "failed",
        completedAt: args.now,
      };
    }
    await ctx.db.patch(run._id, {
      status: "failed",
      steps,
      activeWorkflowRunId: undefined,
      error: args.error.slice(0, 2000),
      updatedAt: args.now,
    });
    return true;
  },
});

export const advance = serviceMutation({
  args: {
    tenantId: v.string(),
    workflowRunId: v.string(),
    status: v.union(
      v.literal("success"),
      v.literal("failed"),
      v.literal("blocked"),
    ),
    output: v.record(v.string(), v.any()),
    now: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("pipelineRuns")
      .withIndex("by_active_workflow", (q) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("activeWorkflowRunId", args.workflowRunId),
      )
      .unique();
    if (!run || run.status !== "running") return null;
    const current = run.steps[run.currentStepIndex];
    if (!current || current.workflowRunId !== args.workflowRunId) return null;

    const steps = [...run.steps];
    steps[run.currentStepIndex] = {
      ...current,
      status:
        args.status === "success"
          ? "done"
          : args.status === "blocked"
            ? "blocked"
            : "failed",
      completedAt: args.now,
      output: args.output,
    };
    if (args.status !== "success") {
      await ctx.db.patch(run._id, {
        status: args.status,
        steps,
        activeWorkflowRunId: undefined,
        error: `Workflow ${current.workflowId} ${args.status}.`,
        updatedAt: args.now,
      });
      return { kind: args.status as "failed" | "blocked" };
    }
    const nextIndex = run.currentStepIndex + 1;
    const next = steps[nextIndex];
    const facts = { ...(run.facts ?? run.input ?? {}), ...args.output };
    if (!next) {
      await ctx.db.patch(run._id, {
        status: "done",
        steps,
        facts,
        activeWorkflowRunId: undefined,
        updatedAt: args.now,
      });
      return { kind: "done" as const };
    }
    await ctx.db.patch(run._id, {
      steps,
      facts,
      currentStepIndex: nextIndex,
      activeWorkflowRunId: undefined,
      updatedAt: args.now,
    });
    return {
      kind: "next" as const,
      pipelineId: run.pipelineId,
      runId: run.runId,
      stepIndex: nextIndex,
      step: next,
      facts,
      // Temporary compatibility for a Dashboard deployed before this backend.
      input: facts,
      previousOutput: args.output,
    };
  },
});

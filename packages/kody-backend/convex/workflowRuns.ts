import { query } from "./_generated/server"
import { v } from "convex/values"
import { workflowRunStateValidator, workflowRunnerValidator } from "./validators"
import { serviceMutation, serviceQuery } from "./lib/auth"

// DELIBERATELY PUBLIC (no requireServiceKey): the browser subscribes to this
// via ConvexProvider (useWorkflowRunStateLive) and cannot carry the service
// secret. It exposes exactly what GET /api/kody/company/workflows/:id/runs
// already served — run state scoped by (tenantId, workflowId). The optional
// serviceKey arg is accepted and ignored so the auto-injecting server client
// can call it too.
export const list = query({
  args: {
    tenantId: v.string(),
    workflowId: v.string(),
    serviceKey: v.optional(v.string()),
  },
  handler: async (ctx, { tenantId, workflowId }) => {
    return await ctx.db
      .query("workflowRuns")
      .withIndex("by_workflow", (q) => q.eq("tenantId", tenantId).eq("workflowId", workflowId))
      .take(500) // rate-bound: a workflow's run count grows slowly
  },
})

export const get = serviceQuery({
  args: { tenantId: v.string(), workflowId: v.string(), runId: v.string() },
  handler: async (ctx, { tenantId, workflowId, runId }) => {
    return await ctx.db
      .query("workflowRuns")
      .withIndex("by_run", (q) =>
        q.eq("tenantId", tenantId).eq("workflowId", workflowId).eq("runId", runId),
      )
      .unique()
  },
})

export const save = serviceMutation({
  args: {
    tenantId: v.string(),
    workflowId: v.string(),
    runId: v.string(),
    state: workflowRunStateValidator,
    runner: v.optional(workflowRunnerValidator),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("workflowRuns")
      .withIndex("by_run", (q) =>
        q.eq("tenantId", args.tenantId).eq("workflowId", args.workflowId).eq("runId", args.runId),
      )
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, {
        state: args.state,
        ...(args.runner ? { runner: args.runner } : {}),
        updatedAt: args.updatedAt,
      })
      return existing._id
    }
    return await ctx.db.insert("workflowRuns", args)
  },
})

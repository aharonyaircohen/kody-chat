import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import { workflowRunStateValidator } from "./validators"

export const list = query({
  args: { tenantId: v.string(), workflowId: v.string() },
  handler: async (ctx, { tenantId, workflowId }) => {
    return await ctx.db
      .query("workflowRuns")
      .withIndex("by_workflow", (q) => q.eq("tenantId", tenantId).eq("workflowId", workflowId))
      .collect()
  },
})

export const get = query({
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

export const save = mutation({
  args: {
    tenantId: v.string(),
    workflowId: v.string(),
    runId: v.string(),
    state: workflowRunStateValidator,
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
      await ctx.db.patch(existing._id, { state: args.state, updatedAt: args.updatedAt })
      return existing._id
    }
    return await ctx.db.insert("workflowRuns", args)
  },
})

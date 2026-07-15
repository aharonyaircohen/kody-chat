import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

export const list = query({
  args: { repo: v.string() },
  handler: async (ctx, { repo }) => {
    return await ctx.db
      .query("workflows")
      .withIndex("by_repo", (q) => q.eq("repo", repo))
      .collect()
  },
})

export const get = query({
  args: { repo: v.string(), workflowId: v.string() },
  handler: async (ctx, { repo, workflowId }) => {
    return await ctx.db
      .query("workflows")
      .withIndex("by_repo", (q) => q.eq("repo", repo).eq("workflowId", workflowId))
      .unique()
  },
})

export const save = mutation({
  args: {
    repo: v.string(),
    workflowId: v.string(),
    definition: v.any(),
    source: v.union(v.literal("local"), v.literal("store")),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("workflows")
      .withIndex("by_repo", (q) => q.eq("repo", args.repo).eq("workflowId", args.workflowId))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, {
        definition: args.definition,
        source: args.source,
        updatedAt: args.updatedAt,
      })
      return existing._id
    }
    return await ctx.db.insert("workflows", args)
  },
})

export const remove = mutation({
  args: { repo: v.string(), workflowId: v.string() },
  handler: async (ctx, { repo, workflowId }) => {
    const existing = await ctx.db
      .query("workflows")
      .withIndex("by_repo", (q) => q.eq("repo", repo).eq("workflowId", workflowId))
      .unique()
    if (existing) await ctx.db.delete(existing._id)
  },
})

export const listRuns = query({
  args: { repo: v.string(), workflowId: v.string() },
  handler: async (ctx, { repo, workflowId }) => {
    return await ctx.db
      .query("workflowRuns")
      .withIndex("by_workflow", (q) => q.eq("repo", repo).eq("workflowId", workflowId))
      .collect()
  },
})

export const getRun = query({
  args: { repo: v.string(), workflowId: v.string(), runId: v.string() },
  handler: async (ctx, { repo, workflowId, runId }) => {
    return await ctx.db
      .query("workflowRuns")
      .withIndex("by_run", (q) =>
        q.eq("repo", repo).eq("workflowId", workflowId).eq("runId", runId),
      )
      .unique()
  },
})

export const saveRun = mutation({
  args: {
    repo: v.string(),
    workflowId: v.string(),
    runId: v.string(),
    state: v.any(),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("workflowRuns")
      .withIndex("by_run", (q) =>
        q.eq("repo", args.repo).eq("workflowId", args.workflowId).eq("runId", args.runId),
      )
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, { state: args.state, updatedAt: args.updatedAt })
      return existing._id
    }
    return await ctx.db.insert("workflowRuns", args)
  },
})

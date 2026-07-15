import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

// Global (cross-tenant) engine action state — replaces action-state.json in
// the Kody-Dashboard repo.

export const get = query({
  args: { runId: v.string() },
  handler: async (ctx, { runId }) => {
    return await ctx.db
      .query("actionStates")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .unique()
  },
})

export const save = mutation({
  args: { runId: v.string(), state: v.any(), updatedAt: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("actionStates")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, { state: args.state, updatedAt: args.updatedAt })
      return existing._id
    }
    return await ctx.db.insert("actionStates", args)
  },
})

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("actionStates").collect()
  },
})

export const remove = mutation({
  args: { runId: v.string() },
  handler: async (ctx, { runId }) => {
    const existing = await ctx.db
      .query("actionStates")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .unique()
    if (!existing) return false
    await ctx.db.delete(existing._id)
    return true
  },
})

import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    return await ctx.db
      .query("goals")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
      .collect()
  },
})

export const save = mutation({
  args: { tenantId: v.string(), goalId: v.string(), state: v.any(), updatedAt: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("goals")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId).eq("goalId", args.goalId))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, { state: args.state, updatedAt: args.updatedAt })
      return existing._id
    }
    return await ctx.db.insert("goals", args)
  },
})

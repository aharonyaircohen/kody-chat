import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    return await ctx.db
      .query("macros")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
      .collect()
  },
})

export const save = mutation({
  args: { tenantId: v.string(), macroId: v.string(), macro: v.any() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("macros")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId).eq("macroId", args.macroId))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, { macro: args.macro })
      return existing._id
    }
    return await ctx.db.insert("macros", args)
  },
})

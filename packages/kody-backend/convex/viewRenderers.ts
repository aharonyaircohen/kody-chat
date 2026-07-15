import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    return await ctx.db
      .query("viewRenderers")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
      .collect()
  },
})

export const save = mutation({
  args: { tenantId: v.string(), slug: v.string(), definition: v.any(), updatedAt: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("viewRenderers")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId).eq("slug", args.slug))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, {
        definition: args.definition,
        updatedAt: args.updatedAt,
      })
      return existing._id
    }
    return await ctx.db.insert("viewRenderers", args)
  },
})

export const remove = mutation({
  args: { tenantId: v.string(), slug: v.string() },
  handler: async (ctx, { tenantId, slug }) => {
    const existing = await ctx.db
      .query("viewRenderers")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId).eq("slug", slug))
      .unique()
    if (existing) await ctx.db.delete(existing._id)
  },
})

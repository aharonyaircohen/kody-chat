import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

// Singleton per-tenant documents keyed by `kind`: dashboard config, system
// prompt, instructions, context docs.

export const get = query({
  args: { tenantId: v.string(), kind: v.string() },
  handler: async (ctx, { tenantId, kind }) => {
    return await ctx.db
      .query("repoDocs")
      .withIndex("by_kind", (q) => q.eq("tenantId", tenantId).eq("kind", kind))
      .unique()
  },
})

// Every doc whose kind starts with `prefix` (e.g. "context:", "operation:").
// The by_kind index is range-scanned, so this never reads other kinds.
export const listByPrefix = query({
  args: { tenantId: v.string(), prefix: v.string() },
  handler: async (ctx, { tenantId, prefix }) => {
    return await ctx.db
      .query("repoDocs")
      .withIndex("by_kind", (q) =>
        q.eq("tenantId", tenantId).gte("kind", prefix).lt("kind", `${prefix}￿`),
      )
      .collect()
  },
})

export const save = mutation({
  args: { tenantId: v.string(), kind: v.string(), doc: v.any(), updatedAt: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("repoDocs")
      .withIndex("by_kind", (q) => q.eq("tenantId", args.tenantId).eq("kind", args.kind))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, { doc: args.doc, updatedAt: args.updatedAt })
      return existing._id
    }
    return await ctx.db.insert("repoDocs", args)
  },
})

export const remove = mutation({
  args: { tenantId: v.string(), kind: v.string() },
  handler: async (ctx, { tenantId, kind }) => {
    const existing = await ctx.db
      .query("repoDocs")
      .withIndex("by_kind", (q) => q.eq("tenantId", tenantId).eq("kind", kind))
      .unique()
    if (existing) await ctx.db.delete(existing._id)
  },
})

import { serviceMutation as mutation, serviceQuery as query } from "./lib/auth"
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
      .take(100)
  },
})

export const save = mutation({
  args: {
    tenantId: v.string(),
    kind: v.string(),
    doc: v.any(),
    updatedAt: v.string(),
    expectedUpdatedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("repoDocs")
      .withIndex("by_kind", (q) => q.eq("tenantId", args.tenantId).eq("kind", args.kind))
      .unique()
    if (existing) {
      if (args.expectedUpdatedAt !== undefined && existing.updatedAt !== args.expectedUpdatedAt) {
        throw new Error("Repository document changed since it was read")
      }
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

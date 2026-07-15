import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

// Per-tenantId config surface: singleton docs (dashboard config, system prompt,
// context docs), reports, macros, view renderers.

export const getDoc = query({
  args: { tenantId: v.string(), kind: v.string() },
  handler: async (ctx, { tenantId, kind }) => {
    return await ctx.db
      .query("repoDocs")
      .withIndex("by_kind", (q) => q.eq("tenantId", tenantId).eq("kind", kind))
      .unique()
  },
})

export const saveDoc = mutation({
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

export const listReports = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    return await ctx.db
      .query("reports")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
      .collect()
  },
})

export const saveReport = mutation({
  args: {
    tenantId: v.string(),
    slug: v.string(),
    runId: v.optional(v.string()),
    title: v.optional(v.string()),
    body: v.string(),
    meta: v.any(),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("reports")
      .withIndex("by_slug", (q) =>
        q.eq("tenantId", args.tenantId).eq("slug", args.slug).eq("runId", args.runId),
      )
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        body: args.body,
        meta: args.meta,
        updatedAt: args.updatedAt,
      })
      return existing._id
    }
    return await ctx.db.insert("reports", args)
  },
})

export const listMacros = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    return await ctx.db
      .query("macros")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
      .collect()
  },
})

export const saveMacro = mutation({
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

export const listRenderers = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    return await ctx.db
      .query("viewRenderers")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
      .collect()
  },
})

export const saveRenderer = mutation({
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

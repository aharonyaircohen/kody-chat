import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

// Intents, decisions, goals, agents — the "company" domain.

export const listIntents = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    return await ctx.db
      .query("intents")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
      .collect()
  },
})

export const saveIntent = mutation({
  args: { tenantId: v.string(), intentId: v.string(), intent: v.any(), updatedAt: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("intents")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId).eq("intentId", args.intentId))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, { intent: args.intent, updatedAt: args.updatedAt })
      return existing._id
    }
    return await ctx.db.insert("intents", args)
  },
})

export const appendDecision = mutation({
  args: { tenantId: v.string(), intentId: v.string(), decision: v.any() },
  handler: async (ctx, { tenantId, intentId, decision }) => {
    const last = await ctx.db
      .query("intentDecisions")
      .withIndex("by_intent", (q) => q.eq("tenantId", tenantId).eq("intentId", intentId))
      .order("desc")
      .first()
    const seq = (last?.seq ?? -1) + 1
    return await ctx.db.insert("intentDecisions", { tenantId, intentId, seq, decision })
  },
})

export const listGoals = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    return await ctx.db
      .query("goals")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
      .collect()
  },
})

export const saveGoal = mutation({
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

export const listAgents = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
      .collect()
  },
})

export const saveAgent = mutation({
  args: {
    tenantId: v.string(),
    slug: v.string(),
    frontmatter: v.any(),
    body: v.string(),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agents")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId).eq("slug", args.slug))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, {
        frontmatter: args.frontmatter,
        body: args.body,
        updatedAt: args.updatedAt,
      })
      return existing._id
    }
    return await ctx.db.insert("agents", args)
  },
})

import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

// Intents, decisions, goals, agents — the "company" domain.

export const listIntents = query({
  args: { repo: v.string() },
  handler: async (ctx, { repo }) => {
    return await ctx.db
      .query("intents")
      .withIndex("by_repo", (q) => q.eq("repo", repo))
      .collect()
  },
})

export const saveIntent = mutation({
  args: { repo: v.string(), intentId: v.string(), intent: v.any(), updatedAt: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("intents")
      .withIndex("by_repo", (q) => q.eq("repo", args.repo).eq("intentId", args.intentId))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, { intent: args.intent, updatedAt: args.updatedAt })
      return existing._id
    }
    return await ctx.db.insert("intents", args)
  },
})

export const appendDecision = mutation({
  args: { repo: v.string(), intentId: v.string(), decision: v.any() },
  handler: async (ctx, { repo, intentId, decision }) => {
    const last = await ctx.db
      .query("intentDecisions")
      .withIndex("by_intent", (q) => q.eq("repo", repo).eq("intentId", intentId))
      .order("desc")
      .first()
    const seq = (last?.seq ?? -1) + 1
    return await ctx.db.insert("intentDecisions", { repo, intentId, seq, decision })
  },
})

export const listGoals = query({
  args: { repo: v.string() },
  handler: async (ctx, { repo }) => {
    return await ctx.db
      .query("goals")
      .withIndex("by_repo", (q) => q.eq("repo", repo))
      .collect()
  },
})

export const saveGoal = mutation({
  args: { repo: v.string(), goalId: v.string(), state: v.any(), updatedAt: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("goals")
      .withIndex("by_repo", (q) => q.eq("repo", args.repo).eq("goalId", args.goalId))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, { state: args.state, updatedAt: args.updatedAt })
      return existing._id
    }
    return await ctx.db.insert("goals", args)
  },
})

export const listAgents = query({
  args: { repo: v.string() },
  handler: async (ctx, { repo }) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_repo", (q) => q.eq("repo", repo))
      .collect()
  },
})

export const saveAgent = mutation({
  args: {
    repo: v.string(),
    slug: v.string(),
    frontmatter: v.any(),
    body: v.string(),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agents")
      .withIndex("by_repo", (q) => q.eq("repo", args.repo).eq("slug", args.slug))
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

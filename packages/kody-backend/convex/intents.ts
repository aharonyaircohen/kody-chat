import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import { companyIntentValidator, intentDecisionValidator } from "./validators"

export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    return await ctx.db
      .query("intents")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
      .collect()
  },
})

export const save = mutation({
  args: { tenantId: v.string(), intentId: v.string(), intent: companyIntentValidator, updatedAt: v.string() },
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

// Decision log is part of the intent aggregate (today: decisions.jsonl).
export const listDecisions = query({
  args: { tenantId: v.string(), intentId: v.string() },
  handler: async (ctx, { tenantId, intentId }) => {
    return await ctx.db
      .query("intentDecisions")
      .withIndex("by_intent", (q) => q.eq("tenantId", tenantId).eq("intentId", intentId))
      .collect()
  },
})

export const appendDecision = mutation({
  args: { tenantId: v.string(), intentId: v.string(), decision: intentDecisionValidator },
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

import { v } from "convex/values"
import { serviceMutation as mutation, serviceQuery as query } from "./lib/auth"

export const listByRun = query({
  args: { tenantId: v.string(), runId: v.string() },
  handler: async (ctx, { tenantId, runId }) =>
    await ctx.db
      .query("runEvents")
      .withIndex("by_run", (q) => q.eq("tenantId", tenantId).eq("runId", runId))
      .collect(),
})

export const listByGoal = query({
  args: { tenantId: v.string(), goalId: v.string(), limit: v.number() },
  handler: async (ctx, { tenantId, goalId, limit }) =>
    await ctx.db
      .query("runEvents")
      .withIndex("by_goal", (q) => q.eq("tenantId", tenantId).eq("goalId", goalId))
      .order("desc")
      .take(Math.max(1, Math.min(limit, 1000))),
})

export const append = mutation({
  args: {
    tenantId: v.string(),
    runId: v.string(),
    goalId: v.optional(v.string()),
    event: v.any(),
    time: v.string(),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query("runEvents")
        .withIndex("by_idempotency", (q) =>
          q
            .eq("tenantId", args.tenantId)
            .eq("runId", args.runId)
            .eq("idempotencyKey", args.idempotencyKey),
        )
        .unique()
      if (existing) return existing._id
    }
    const last = await ctx.db
      .query("runEvents")
      .withIndex("by_run", (q) => q.eq("tenantId", args.tenantId).eq("runId", args.runId))
      .order("desc")
      .first()
    return await ctx.db.insert("runEvents", { ...args, seq: (last?.seq ?? -1) + 1 })
  },
})

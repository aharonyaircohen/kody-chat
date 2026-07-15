import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

// Global Kody engine store — replaces the Kody-Dashboard repo's
// action-state.json and event-log.jsonl.

const EVENT_LOG_CAP = 10_000

export const getActionState = query({
  args: { runId: v.string() },
  handler: async (ctx, { runId }) => {
    return await ctx.db
      .query("actionStates")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .unique()
  },
})

export const saveActionState = mutation({
  args: { runId: v.string(), state: v.any(), updatedAt: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("actionStates")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, { state: args.state, updatedAt: args.updatedAt })
      return existing._id
    }
    return await ctx.db.insert("actionStates", args)
  },
})

export const appendEvent = mutation({
  args: {
    entryId: v.string(),
    runId: v.string(),
    event: v.string(),
    payload: v.any(),
    channel: v.optional(v.string()),
    emittedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("eventLog", args)
    // Trim to cap, matching today's event-log.jsonl behavior.
    const oldest = await ctx.db
      .query("eventLog")
      .withIndex("by_emitted")
      .order("asc")
      .take(EVENT_LOG_CAP + 100)
    if (oldest.length > EVENT_LOG_CAP) {
      for (const doc of oldest.slice(0, oldest.length - EVENT_LOG_CAP)) {
        await ctx.db.delete(doc._id)
      }
    }
    return id
  },
})

export const eventsForRun = query({
  args: { runId: v.string() },
  handler: async (ctx, { runId }) => {
    return await ctx.db
      .query("eventLog")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect()
  },
})

export const recentEvents = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    return await ctx.db
      .query("eventLog")
      .withIndex("by_emitted")
      .order("desc")
      .take(Math.min(limit ?? 100, 1000))
  },
})

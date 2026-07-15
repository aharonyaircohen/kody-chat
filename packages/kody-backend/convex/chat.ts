import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

export const listSessions = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    return await ctx.db
      .query("chatSessions")
      .withIndex("by_session", (q) => q.eq("tenantId", tenantId))
      .collect()
  },
})

export const getSession = query({
  args: { tenantId: v.string(), sessionId: v.string() },
  handler: async (ctx, { tenantId, sessionId }) => {
    const session = await ctx.db
      .query("chatSessions")
      .withIndex("by_session", (q) => q.eq("tenantId", tenantId).eq("sessionId", sessionId))
      .unique()
    if (!session) return null
    const turns = await ctx.db
      .query("chatTurns")
      .withIndex("by_session", (q) => q.eq("tenantId", tenantId).eq("sessionId", sessionId))
      .collect()
    return { session, turns }
  },
})

export const upsertSession = mutation({
  args: {
    tenantId: v.string(),
    sessionId: v.string(),
    meta: v.any(),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("chatSessions")
      .withIndex("by_session", (q) => q.eq("tenantId", args.tenantId).eq("sessionId", args.sessionId))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, { meta: args.meta, updatedAt: args.updatedAt })
      return existing._id
    }
    return await ctx.db.insert("chatSessions", args)
  },
})

export const appendTurn = mutation({
  args: { tenantId: v.string(), sessionId: v.string(), turn: v.any() },
  handler: async (ctx, { tenantId, sessionId, turn }) => {
    const last = await ctx.db
      .query("chatTurns")
      .withIndex("by_session", (q) => q.eq("tenantId", tenantId).eq("sessionId", sessionId))
      .order("desc")
      .first()
    const seq = (last?.seq ?? -1) + 1
    return await ctx.db.insert("chatTurns", { tenantId, sessionId, seq, turn })
  },
})

export const appendEvent = mutation({
  args: { tenantId: v.string(), sessionId: v.string(), event: v.any() },
  handler: async (ctx, { tenantId, sessionId, event }) => {
    const last = await ctx.db
      .query("chatEvents")
      .withIndex("by_session", (q) => q.eq("tenantId", tenantId).eq("sessionId", sessionId))
      .order("desc")
      .first()
    const seq = (last?.seq ?? -1) + 1
    return await ctx.db.insert("chatEvents", { tenantId, sessionId, seq, event })
  },
})

// Reactive tail of a session's event stream — the UI subscribes with the last
// seq it has and receives new events as they land.
export const eventsSince = query({
  args: { tenantId: v.string(), sessionId: v.string(), afterSeq: v.number() },
  handler: async (ctx, { tenantId, sessionId, afterSeq }) => {
    return await ctx.db
      .query("chatEvents")
      .withIndex("by_session", (q) =>
        q.eq("tenantId", tenantId).eq("sessionId", sessionId).gt("seq", afterSeq),
      )
      .collect()
  },
})

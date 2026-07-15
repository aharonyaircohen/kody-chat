import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

export const listSessions = query({
  args: { repo: v.string() },
  handler: async (ctx, { repo }) => {
    return await ctx.db
      .query("chatSessions")
      .withIndex("by_session", (q) => q.eq("repo", repo))
      .collect()
  },
})

export const getSession = query({
  args: { repo: v.string(), sessionId: v.string() },
  handler: async (ctx, { repo, sessionId }) => {
    const session = await ctx.db
      .query("chatSessions")
      .withIndex("by_session", (q) => q.eq("repo", repo).eq("sessionId", sessionId))
      .unique()
    if (!session) return null
    const turns = await ctx.db
      .query("chatTurns")
      .withIndex("by_session", (q) => q.eq("repo", repo).eq("sessionId", sessionId))
      .collect()
    return { session, turns }
  },
})

export const upsertSession = mutation({
  args: {
    repo: v.string(),
    sessionId: v.string(),
    meta: v.any(),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("chatSessions")
      .withIndex("by_session", (q) => q.eq("repo", args.repo).eq("sessionId", args.sessionId))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, { meta: args.meta, updatedAt: args.updatedAt })
      return existing._id
    }
    return await ctx.db.insert("chatSessions", args)
  },
})

export const appendTurn = mutation({
  args: { repo: v.string(), sessionId: v.string(), turn: v.any() },
  handler: async (ctx, { repo, sessionId, turn }) => {
    const last = await ctx.db
      .query("chatTurns")
      .withIndex("by_session", (q) => q.eq("repo", repo).eq("sessionId", sessionId))
      .order("desc")
      .first()
    const seq = (last?.seq ?? -1) + 1
    return await ctx.db.insert("chatTurns", { repo, sessionId, seq, turn })
  },
})

export const appendEvent = mutation({
  args: { repo: v.string(), sessionId: v.string(), event: v.any() },
  handler: async (ctx, { repo, sessionId, event }) => {
    const last = await ctx.db
      .query("chatEvents")
      .withIndex("by_session", (q) => q.eq("repo", repo).eq("sessionId", sessionId))
      .order("desc")
      .first()
    const seq = (last?.seq ?? -1) + 1
    return await ctx.db.insert("chatEvents", { repo, sessionId, seq, event })
  },
})

// Reactive tail of a session's event stream — the UI subscribes with the last
// seq it has and receives new events as they land.
export const eventsSince = query({
  args: { repo: v.string(), sessionId: v.string(), afterSeq: v.number() },
  handler: async (ctx, { repo, sessionId, afterSeq }) => {
    return await ctx.db
      .query("chatEvents")
      .withIndex("by_session", (q) =>
        q.eq("repo", repo).eq("sessionId", sessionId).gt("seq", afterSeq),
      )
      .collect()
  },
})

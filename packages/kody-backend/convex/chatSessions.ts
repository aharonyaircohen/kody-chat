import { serviceMutation as mutation, serviceQuery as query } from "./lib/auth"
import { v } from "convex/values"

export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    return await ctx.db
      .query("chatSessions")
      .withIndex("by_session", (q) => q.eq("tenantId", tenantId))
      .collect()
  },
})

// Session meta plus its full transcript.
export const get = query({
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

export const upsert = mutation({
  args: {
    tenantId: v.string(),
    sessionId: v.string(),
    meta: v.any(),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("chatSessions")
      .withIndex("by_session", (q) =>
        q.eq("tenantId", args.tenantId).eq("sessionId", args.sessionId),
      )
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, { meta: args.meta, updatedAt: args.updatedAt })
      return existing._id
    }
    return await ctx.db.insert("chatSessions", args)
  },
})

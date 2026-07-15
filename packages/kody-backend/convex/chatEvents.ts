import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

export const append = mutation({
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
export const since = query({
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

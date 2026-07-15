import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

export const list = query({
  args: { tenantId: v.string(), sessionId: v.string() },
  handler: async (ctx, { tenantId, sessionId }) => {
    return await ctx.db
      .query("chatTurns")
      .withIndex("by_session", (q) => q.eq("tenantId", tenantId).eq("sessionId", sessionId))
      .collect()
  },
})

export const append = mutation({
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

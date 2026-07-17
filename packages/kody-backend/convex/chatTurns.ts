import { serviceMutation as mutation, serviceQuery as query } from "./lib/auth"
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
    // Dashboard dispatch and the runner can both seed the same initial user
    // turn. Treat an identical adjacent turn as an idempotent retry; distinct
    // repeated messages remain valid once an assistant turn separates them.
    if (
      last &&
      typeof last.turn === "object" &&
      last.turn !== null &&
      typeof turn === "object" &&
      turn !== null &&
      last.turn.role === turn.role &&
      last.turn.content === turn.content
    ) {
      return last._id
    }
    const seq = (last?.seq ?? -1) + 1
    return await ctx.db.insert("chatTurns", { tenantId, sessionId, seq, turn })
  },
})

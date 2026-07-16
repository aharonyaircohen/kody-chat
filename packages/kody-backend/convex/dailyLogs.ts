import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

const streamValidator = v.union(
  v.literal("activity"),
  v.literal("events"),
  v.literal("flyActivity"),
)

export const forDate = query({
  args: { tenantId: v.string(), stream: streamValidator, date: v.string() },
  handler: async (ctx, { tenantId, stream, date }) => {
    return await ctx.db
      .query("dailyLogs")
      .withIndex("by_stream", (q) =>
        q.eq("tenantId", tenantId).eq("stream", stream).eq("date", date),
      )
      .collect()
  },
})

// Newest entries first across dates — the by_stream index (tenantId, stream,
// date, seq) descends by date then seq, so `take(limit)` is the most recent
// `limit` lines without scanning older days.
export const recent = query({
  args: { tenantId: v.string(), stream: streamValidator, limit: v.number() },
  handler: async (ctx, { tenantId, stream, limit }) => {
    const capped = Math.max(1, Math.min(limit, 1000))
    return await ctx.db
      .query("dailyLogs")
      .withIndex("by_stream", (q) => q.eq("tenantId", tenantId).eq("stream", stream))
      .order("desc")
      .take(capped)
  },
})

export const append = mutation({
  args: {
    tenantId: v.string(),
    stream: streamValidator,
    date: v.string(),
    entry: v.any(),
  },
  handler: async (ctx, { tenantId, stream, date, entry }) => {
    const last = await ctx.db
      .query("dailyLogs")
      .withIndex("by_stream", (q) =>
        q.eq("tenantId", tenantId).eq("stream", stream).eq("date", date),
      )
      .order("desc")
      .first()
    const seq = (last?.seq ?? -1) + 1
    return await ctx.db.insert("dailyLogs", { tenantId, stream, date, seq, entry })
  },
})

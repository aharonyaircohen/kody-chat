import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

const streamValidator = v.union(v.literal("activity"), v.literal("events"))

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

import { serviceMutation as mutation, serviceQuery as query } from "./lib/auth"
import { v } from "convex/values"

export const get = query({
  args: { tenantId: v.string(), namespace: v.string(), userKey: v.string() },
  handler: async (ctx, { tenantId, namespace, userKey }) => {
    return await ctx.db
      .query("userState")
      .withIndex("by_user", (q) =>
        q.eq("tenantId", tenantId).eq("namespace", namespace).eq("userKey", userKey),
      )
      .unique()
  },
})

export const save = mutation({
  args: {
    tenantId: v.string(),
    namespace: v.string(),
    userKey: v.string(),
    data: v.any(),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userState")
      .withIndex("by_user", (q) =>
        q.eq("tenantId", args.tenantId).eq("namespace", args.namespace).eq("userKey", args.userKey),
      )
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, { data: args.data, updatedAt: args.updatedAt })
      return existing._id
    }
    return await ctx.db.insert("userState", args)
  },
})

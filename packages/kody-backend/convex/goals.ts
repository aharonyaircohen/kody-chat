import { v } from "convex/values";
import { query as publicQuery } from "./_generated/server";
import { serviceMutation as mutation, serviceQuery as query } from "./lib/auth";

export const liveList = publicQuery({
  args: { tenantId: v.string(), serviceKey: v.optional(v.string()) },
  handler: async (ctx, { tenantId }) =>
    await ctx.db
      .query("goals")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
      .take(500),
});

export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) =>
    await ctx.db
      .query("goals")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
      .take(500),
});

export const get = query({
  args: { tenantId: v.string(), goalId: v.string() },
  handler: async (ctx, { tenantId, goalId }) =>
    await ctx.db
      .query("goals")
      .withIndex("by_tenant", (q) =>
        q.eq("tenantId", tenantId).eq("goalId", goalId),
      )
      .unique(),
});

export const save = mutation({
  args: {
    tenantId: v.string(),
    goalId: v.string(),
    state: v.any(),
    updatedAt: v.string(),
    expectedUpdatedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("goals")
      .withIndex("by_tenant", (q) =>
        q.eq("tenantId", args.tenantId).eq("goalId", args.goalId),
      )
      .unique();
    if (existing) {
      if (
        args.expectedUpdatedAt !== undefined &&
        existing.updatedAt !== args.expectedUpdatedAt
      ) {
        throw new Error("Goal state changed since it was read");
      }
      await ctx.db.patch(existing._id, {
        state: args.state,
        updatedAt: args.updatedAt,
      });
      return existing._id;
    }
    return await ctx.db.insert("goals", args);
  },
});

export const remove = mutation({
  args: { tenantId: v.string(), goalId: v.string() },
  handler: async (ctx, { tenantId, goalId }) => {
    const existing = await ctx.db
      .query("goals")
      .withIndex("by_tenant", (q) =>
        q.eq("tenantId", tenantId).eq("goalId", goalId),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

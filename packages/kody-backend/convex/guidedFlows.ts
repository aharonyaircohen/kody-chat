import { v } from "convex/values";
import { serviceMutation as mutation, serviceQuery as query } from "./lib/auth";

const flowStateArgs = {
  tenantId: v.string(),
  actorId: v.string(),
  instanceId: v.string(),
  instanceKey: v.optional(v.string()),
  flowId: v.string(),
  flowVersion: v.number(),
  currentStepId: v.string(),
  status: v.union(
    v.literal("active"),
    v.literal("completed"),
    v.literal("cancelled"),
  ),
  revision: v.number(),
  data: v.any(),
  history: v.array(v.string()),
  updatedAt: v.string(),
};

export const get = query({
  args: {
    tenantId: v.string(),
    actorId: v.string(),
    instanceId: v.string(),
  },
  handler: async (ctx, { tenantId, actorId, instanceId }) => {
    return await ctx.db
      .query("guidedFlowInstances")
      .withIndex("by_instance", (q) =>
        q
          .eq("tenantId", tenantId)
          .eq("actorId", actorId)
          .eq("instanceId", instanceId),
      )
      .unique();
  },
});

export const listActive = query({
  args: { tenantId: v.string(), actorId: v.string() },
  handler: async (ctx, { tenantId, actorId }) => {
    return await ctx.db
      .query("guidedFlowInstances")
      .withIndex("by_actor_status", (q) =>
        q
          .eq("tenantId", tenantId)
          .eq("actorId", actorId)
          .eq("status", "active"),
      )
      .order("desc")
      .collect();
  },
});

export const list = query({
  args: { tenantId: v.string(), actorId: v.string() },
  handler: async (ctx, { tenantId, actorId }) => {
    return await ctx.db
      .query("guidedFlowInstances")
      .withIndex("by_actor_status", (q) =>
        q.eq("tenantId", tenantId).eq("actorId", actorId),
      )
      .order("desc")
      .collect();
  },
});

export const upsert = mutation({
  args: flowStateArgs,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("guidedFlowInstances")
      .withIndex("by_instance", (q) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("actorId", args.actorId)
          .eq("instanceId", args.instanceId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        flowId: args.flowId,
        flowVersion: args.flowVersion,
        instanceKey: args.instanceKey,
        currentStepId: args.currentStepId,
        status: args.status,
        revision: args.revision,
        data: args.data,
        history: args.history,
        updatedAt: args.updatedAt,
      });
      return existing._id;
    }

    return await ctx.db.insert("guidedFlowInstances", args);
  },
});

export const update = mutation({
  args: {
    tenantId: v.string(),
    actorId: v.string(),
    instanceId: v.string(),
    expectedRevision: v.number(),
    currentStepId: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("cancelled"),
    ),
    revision: v.number(),
    data: v.any(),
    history: v.array(v.string()),
    updatedAt: v.string(),
    mutationId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("guidedFlowInstances")
      .withIndex("by_instance", (q) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("actorId", args.actorId)
          .eq("instanceId", args.instanceId),
      )
      .unique();

    if (!existing) throw new Error("GuidedFlow instance not found");
    if (existing.mutationId === args.mutationId) return existing._id;
    if (existing.revision !== args.expectedRevision) {
      throw new Error("GuidedFlow revision conflict");
    }
    if (args.revision !== args.expectedRevision + 1) {
      throw new Error("GuidedFlow revision must advance by one");
    }

    await ctx.db.patch(existing._id, {
      currentStepId: args.currentStepId,
      status: args.status,
      revision: args.revision,
      data: args.data,
      history: args.history,
      updatedAt: args.updatedAt,
      mutationId: args.mutationId,
    });
    return existing._id;
  },
});

export const recordCompletion = mutation({
  args: {
    tenantId: v.string(),
    actorId: v.string(),
    instanceId: v.string(),
    flowId: v.string(),
    flowVersion: v.number(),
    completedAt: v.string(),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("guidedFlowCompletions")
      .withIndex("by_completion", (q) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("actorId", args.actorId)
          .eq("instanceId", args.instanceId),
      )
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("guidedFlowCompletions", args);
  },
});

export const listCompletions = query({
  args: {
    tenantId: v.string(),
    actorId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { tenantId, actorId, limit }) => {
    return await ctx.db
      .query("guidedFlowCompletions")
      .withIndex("by_actor", (q) =>
        q.eq("tenantId", tenantId).eq("actorId", actorId),
      )
      .order("desc")
      .take(Math.min(Math.max(limit ?? 100, 1), 500));
  },
});

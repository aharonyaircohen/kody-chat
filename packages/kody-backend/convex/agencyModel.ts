import { v } from "convex/values";
import {
  createCapabilityDefinition,
  createGoalDefinition,
  createIntentDefinition,
  createLoopDefinition,
  createOperationDefinition,
  createWorkflowDefinition,
} from "@kody-ade/agency-domain";
import { mutation, query } from "./_generated/server";

const definitionKind = v.union(
  v.literal("intent"),
  v.literal("operation"),
  v.literal("goal"),
  v.literal("loop"),
  v.literal("workflow"),
  v.literal("capability"),
);

function validateDefinition(kind: string, data: unknown) {
  if (kind === "intent") return createIntentDefinition(data);
  if (kind === "operation") return createOperationDefinition(data);
  if (kind === "goal") return createGoalDefinition(data);
  if (kind === "loop") return createLoopDefinition(data);
  if (kind === "workflow") return createWorkflowDefinition(data);
  if (kind === "capability") return createCapabilityDefinition(data);
  throw new Error("Unsupported Agency Definition kind");
}

export const createDefinition = mutation({
  args: {
    serviceKey: v.optional(v.string()),
    tenantId: v.string(),
    envelope: v.object({
      schemaVersion: v.number(),
      recordId: v.string(),
      kind: definitionKind,
      data: v.any(),
    }),
    createdAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agencyDefinitions")
      .withIndex("by_tenant", (q) =>
        q.eq("tenantId", args.tenantId).eq("recordId", args.envelope.recordId),
      )
      .unique();
    if (existing) throw new Error("Agency Definitions are immutable");
    const data = validateDefinition(args.envelope.kind, args.envelope.data);
    return ctx.db.insert("agencyDefinitions", {
      tenantId: args.tenantId,
      ...args.envelope,
      data,
      createdAt: args.createdAt,
    });
  },
});

export const listDefinitions = query({
  args: { serviceKey: v.optional(v.string()), tenantId: v.string() },
  handler: (ctx, args) =>
    ctx.db
      .query("agencyDefinitions")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect(),
});

export const putState = mutation({
  args: {
    serviceKey: v.optional(v.string()),
    tenantId: v.string(),
    definitionId: v.string(),
    kind: v.union(v.literal("goal"), v.literal("loop")),
    schemaVersion: v.number(),
    data: v.any(),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const { serviceKey: _serviceKey, ...state } = args;
    const existing = await ctx.db
      .query("agencyStates")
      .withIndex("by_tenant", (q) =>
        q.eq("tenantId", args.tenantId).eq("definitionId", args.definitionId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, state);
      return existing._id;
    }
    return ctx.db.insert("agencyStates", state);
  },
});

export const getState = query({
  args: {
    serviceKey: v.optional(v.string()),
    tenantId: v.string(),
    definitionId: v.string(),
  },
  handler: (ctx, args) =>
    ctx.db
      .query("agencyStates")
      .withIndex("by_tenant", (q) =>
        q.eq("tenantId", args.tenantId).eq("definitionId", args.definitionId),
      )
      .unique(),
});

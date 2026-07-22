import { v } from "convex/values";
import {
  createAgentDefinition,
  createCapabilityDefinition,
  createGoalDefinition,
  createIntentDefinition,
  createLoopDefinition,
  createOperationDefinition,
  createGoalState,
  createLoopState,
  createRunOutput,
  createRun,
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
  v.literal("agent"),
);

function validateDefinition(kind: string, data: unknown) {
  if (kind === "intent") return createIntentDefinition(data);
  if (kind === "operation") return createOperationDefinition(data);
  if (kind === "goal") return createGoalDefinition(data);
  if (kind === "loop") return createLoopDefinition(data);
  if (kind === "workflow") return createWorkflowDefinition(data);
  if (kind === "capability") return createCapabilityDefinition(data);
  if (kind === "agent") return createAgentDefinition(data);
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
    const data =
      args.kind === "goal"
        ? createGoalState(args.data)
        : createLoopState(args.data);
    if (data.definitionId !== args.definitionId) {
      throw new Error("Agency State does not match Definition");
    }
    const existing = await ctx.db
      .query("agencyStates")
      .withIndex("by_tenant", (q) =>
        q.eq("tenantId", args.tenantId).eq("definitionId", args.definitionId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...state, data });
      return existing._id;
    }
    return ctx.db.insert("agencyStates", { ...state, data });
  },
});

export const appendOutput = mutation({
  args: {
    serviceKey: v.optional(v.string()),
    tenantId: v.string(),
    envelope: v.object({
      schemaVersion: v.number(),
      recordId: v.string(),
      data: v.any(),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agencyOutputs")
      .withIndex("by_tenant_record", (q) =>
        q.eq("tenantId", args.tenantId).eq("recordId", args.envelope.recordId),
      )
      .unique();
    if (existing) throw new Error("Agency Outputs are append-only");
    const data = createRunOutput(args.envelope.data);
    return ctx.db.insert("agencyOutputs", {
      tenantId: args.tenantId,
      ...args.envelope,
      runId: data.runId,
      data,
    });
  },
});

export const listOutputs = query({
  args: {
    serviceKey: v.optional(v.string()),
    tenantId: v.string(),
    runId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const runId = args.runId;
    if (runId) {
      return ctx.db
        .query("agencyOutputs")
        .withIndex("by_tenant_run", (q) =>
          q.eq("tenantId", args.tenantId).eq("runId", runId),
        )
        .collect();
    }
    return ctx.db
      .query("agencyOutputs")
      .withIndex("by_tenant_record", (q) => q.eq("tenantId", args.tenantId))
      .collect();
  },
});

const dispatchDecision = v.object({
  kind: v.union(v.literal("fire"), v.literal("skip")),
  reason: v.string(),
  scheduledAt: v.optional(v.string()),
  nextEligibleAt: v.optional(v.string()),
});

export const reserveDispatch = mutation({
  args: {
    serviceKey: v.optional(v.string()),
    tenantId: v.string(),
    idempotencyKey: v.string(),
    loopId: v.string(),
    decision: dispatchDecision,
    leaseUntil: v.string(),
    now: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agencyDispatches")
      .withIndex("by_tenant_key", (q) =>
        q.eq("tenantId", args.tenantId).eq("idempotencyKey", args.idempotencyKey),
      )
      .unique();
    if (existing) return { acquired: false, dispatchId: existing._id };
    const dispatchId = await ctx.db.insert("agencyDispatches", {
      tenantId: args.tenantId,
      idempotencyKey: args.idempotencyKey,
      loopId: args.loopId,
      decision: args.decision,
      status: "reserved",
      leaseUntil: args.leaseUntil,
      createdAt: args.now,
      updatedAt: args.now,
    });
    return { acquired: true, dispatchId };
  },
});

export const recordSkippedDispatch = mutation({
  args: {
    serviceKey: v.optional(v.string()),
    tenantId: v.string(),
    idempotencyKey: v.string(),
    loopId: v.string(),
    decision: dispatchDecision,
    now: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agencyDispatches")
      .withIndex("by_tenant_key", (q) =>
        q.eq("tenantId", args.tenantId).eq("idempotencyKey", args.idempotencyKey),
      )
      .unique();
    if (existing) return existing._id;
    return ctx.db.insert("agencyDispatches", {
      tenantId: args.tenantId,
      idempotencyKey: args.idempotencyKey,
      loopId: args.loopId,
      decision: args.decision,
      status: "skipped",
      createdAt: args.now,
      updatedAt: args.now,
    });
  },
});

export const finishDispatch = mutation({
  args: {
    serviceKey: v.optional(v.string()),
    tenantId: v.string(),
    idempotencyKey: v.string(),
    status: v.union(v.literal("dispatched"), v.literal("failed")),
    runId: v.optional(v.string()),
    now: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agencyDispatches")
      .withIndex("by_tenant_key", (q) =>
        q.eq("tenantId", args.tenantId).eq("idempotencyKey", args.idempotencyKey),
      )
      .unique();
    if (!existing) throw new Error("Agency Dispatch reservation not found");
    if (existing.status !== "reserved") throw new Error("Agency Dispatch is already terminal");
    await ctx.db.patch(existing._id, {
      status: args.status,
      ...(args.runId ? { runId: args.runId } : {}),
      updatedAt: args.now,
    });
  },
});

export const createRunRecord = mutation({
  args: {
    serviceKey: v.optional(v.string()),
    tenantId: v.string(),
    subjectType: v.union(
      v.literal("goal"),
      v.literal("loop"),
      v.literal("workflow"),
      v.literal("capability"),
    ),
    subjectId: v.string(),
    run: v.any(),
    now: v.string(),
  },
  handler: async (ctx, args) => {
    const run = createRun(args.run);
    if (run.status !== "queued" && run.status !== "running") {
      throw new Error("Agency Run must start active");
    }
    const existing = await ctx.db
      .query("agencyRuns")
      .withIndex("by_run", (q) =>
        q.eq("tenantId", args.tenantId).eq("runId", run.id),
      )
      .unique();
    if (existing) throw new Error("Agency Run already exists");
    return ctx.db.insert("agencyRuns", {
      tenantId: args.tenantId,
      runId: run.id,
      subjectType: args.subjectType,
      subjectId: args.subjectId,
      run,
      updatedAt: args.now,
    });
  },
});

export const finishRunRecord = mutation({
  args: {
    serviceKey: v.optional(v.string()),
    tenantId: v.string(),
    run: v.any(),
    now: v.string(),
  },
  handler: async (ctx, args) => {
    const run = createRun(args.run);
    if (
      run.status !== "succeeded" &&
      run.status !== "failed" &&
      run.status !== "cancelled"
    ) {
      throw new Error("Agency Run must finish terminal");
    }
    const existing = await ctx.db
      .query("agencyRuns")
      .withIndex("by_run", (q) =>
        q.eq("tenantId", args.tenantId).eq("runId", run.id),
      )
      .unique();
    if (!existing) throw new Error("Agency Run not found");
    const previous = createRun(existing.run);
    if (previous.status !== "queued" && previous.status !== "running") {
      throw new Error("Agency Run is already terminal");
    }
    assertSameRunIdentity(previous, run);
    await ctx.db.patch(existing._id, { run, updatedAt: args.now });
  },
});

function assertSameRunIdentity(
  previous: ReturnType<typeof createRun>,
  next: ReturnType<typeof createRun>,
) {
  const stable = (value: unknown) => JSON.stringify(value);
  if (
    previous.id !== next.id ||
    previous.correlationId !== next.correlationId ||
    previous.startedAt !== next.startedAt ||
    stable(previous.origin) !== stable(next.origin) ||
    stable(previous.target) !== stable(next.target) ||
    stable(previous.trace) !== stable(next.trace) ||
    stable(previous.effectivePolicy) !== stable(next.effectivePolicy)
  ) {
    throw new Error("Agency Run immutable context changed");
  }
}

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

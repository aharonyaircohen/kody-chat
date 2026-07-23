import { v } from "convex/values";
import {
  createAgentDefinition,
  createCapabilityDefinition,
  createGoalDefinition,
  createIntentDefinition,
  createImplementationDefinition,
  createLoopDefinition,
  createOperationDefinition,
  createGoalState,
  createIntentState,
  createLoopState,
  createOperationState,
  createRunOutput,
  createRun,
  createWorkflowDefinition,
  assertLifecycleTransition,
} from "@kody-ade/agency-domain";
import { serviceMutation as mutation, serviceQuery as query } from "./lib/auth";

const definitionKind = v.union(
  v.literal("intent"),
  v.literal("operation"),
  v.literal("goal"),
  v.literal("loop"),
  v.literal("workflow"),
  v.literal("capability"),
  v.literal("implementation"),
  v.literal("agent"),
);
const stateKind = v.union(
  v.literal("intent"),
  v.literal("operation"),
  v.literal("goal"),
  v.literal("loop"),
);

function validateDefinition(kind: string, data: unknown) {
  if (kind === "intent") return createIntentDefinition(data);
  if (kind === "operation") return createOperationDefinition(data);
  if (kind === "goal") return createGoalDefinition(data);
  if (kind === "loop") return createLoopDefinition(data);
  if (kind === "workflow") return createWorkflowDefinition(data);
  if (kind === "capability") return createCapabilityDefinition(data);
  if (kind === "implementation") return createImplementationDefinition(data);
  if (kind === "agent") return createAgentDefinition(data);
  throw new Error("Unsupported Agency Definition kind");
}

function validateState(kind: string, data: unknown) {
  if (kind === "intent") return createIntentState(data);
  if (kind === "operation") return createOperationState(data);
  if (kind === "goal") return createGoalState(data);
  if (kind === "loop") return createLoopState(data);
  throw new Error("Unsupported Agency State kind");
}

export const applyChange = mutation({
  args: {
    serviceKey: v.optional(v.string()),
    tenantId: v.string(),
    definitions: v.array(
      v.object({
        schemaVersion: v.number(),
        recordId: v.string(),
        kind: definitionKind,
        data: v.any(),
        createdAt: v.string(),
      }),
    ),
    states: v.array(
      v.object({
        definitionId: v.string(),
        kind: stateKind,
        schemaVersion: v.number(),
        data: v.any(),
        updatedAt: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existingDefinitions = await ctx.db
      .query("agencyDefinitions")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();
    const availableDefinitions = new Set(
      existingDefinitions.map(
        (definition) => `${definition.kind}:${definition.data.id}`,
      ),
    );
    const validatedDefinitions = args.definitions.map((envelope) => {
      const data = validateDefinition(envelope.kind, envelope.data);
      availableDefinitions.add(`${envelope.kind}:${data.id}`);
      return { envelope, data };
    });
    const validatedStates = args.states.map((state) => {
      const data = validateState(state.kind, state.data);
      if (data.definitionId !== state.definitionId) {
        throw new Error("Agency State does not match Definition");
      }
      if (!availableDefinitions.has(`${state.kind}:${state.definitionId}`)) {
        throw new Error(
          `Agency State Definition "${state.kind}:${state.definitionId}" was not found`,
        );
      }
      return { state, data };
    });

    let created = 0;
    let reused = 0;
    for (const { envelope, data } of validatedDefinitions) {
      const existing = await ctx.db
        .query("agencyDefinitions")
        .withIndex("by_tenant", (q) =>
          q.eq("tenantId", args.tenantId).eq("recordId", envelope.recordId),
        )
        .unique();
      if (existing) {
        reused += 1;
        continue;
      }
      await ctx.db.insert("agencyDefinitions", {
        tenantId: args.tenantId,
        schemaVersion: envelope.schemaVersion,
        recordId: envelope.recordId,
        kind: envelope.kind,
        data,
        createdAt: envelope.createdAt,
      });
      created += 1;
    }

    for (const { state, data } of validatedStates) {
      const existing = await ctx.db
        .query("agencyStates")
        .withIndex("by_tenant", (q) =>
          q
            .eq("tenantId", args.tenantId)
            .eq("kind", state.kind)
            .eq("definitionId", state.definitionId),
        )
        .unique();
      if (existing) {
        const previous = validateState(existing.kind, existing.data);
        if (previous.lifecycle !== data.lifecycle) {
          assertLifecycleTransition(previous.lifecycle, data.lifecycle);
        }
        await ctx.db.patch(existing._id, {
          schemaVersion: state.schemaVersion,
          data,
          updatedAt: state.updatedAt,
        });
      } else {
        await ctx.db.insert("agencyStates", {
          tenantId: args.tenantId,
          definitionId: state.definitionId,
          kind: state.kind,
          schemaVersion: state.schemaVersion,
          data,
          updatedAt: state.updatedAt,
        });
      }
    }
    return { created, reused, states: validatedStates.length };
  },
});

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
    kind: stateKind,
    schemaVersion: v.number(),
    data: v.any(),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const { serviceKey: _serviceKey, ...state } = args;
    const data =
      args.kind === "intent"
        ? createIntentState(args.data)
        : args.kind === "operation"
          ? createOperationState(args.data)
          : args.kind === "goal"
            ? createGoalState(args.data)
            : createLoopState(args.data);
    if (data.definitionId !== args.definitionId) {
      throw new Error("Agency State does not match Definition");
    }
    const existing = await ctx.db
      .query("agencyStates")
      .withIndex("by_tenant", (q) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("kind", args.kind)
          .eq("definitionId", args.definitionId),
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
    limit: v.optional(v.number()),
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
    const limit = Math.max(1, Math.min(1000, Math.floor(args.limit ?? 500)));
    return ctx.db
      .query("agencyOutputs")
      .withIndex("by_tenant_record", (q) => q.eq("tenantId", args.tenantId))
      .order("desc")
      .take(limit);
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
    reservationId: v.string(),
    correlationId: v.string(),
    policyHash: v.string(),
    effectivePolicy: v.any(),
    definitionRefs: v.array(v.any()),
    maxConcurrentRuns: v.number(),
    requiresApproval: v.boolean(),
    approvalScopeKind: v.union(
      v.literal("loop"),
      v.literal("goal"),
      v.literal("workflow"),
      v.literal("capability"),
    ),
    approvalScopeId: v.string(),
    approvalAction: v.string(),
    now: v.string(),
  },
  handler: async (ctx, args) => {
    if (
      !Number.isInteger(args.maxConcurrentRuns) ||
      args.maxConcurrentRuns <= 0
    ) {
      throw new Error("Agency Dispatch concurrency limit is invalid");
    }
    const existing = await ctx.db
      .query("agencyDispatches")
      .withIndex("by_tenant_key", (q) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("idempotencyKey", args.idempotencyKey),
      )
      .unique();
    if (existing) {
      const expired =
        existing.status === "reserved" &&
        existing.leaseUntil !== undefined &&
        Date.parse(existing.leaseUntil) <= Date.parse(args.now);
      const waiting =
        existing.status === "waiting-approval" ||
        existing.status === "waiting-capacity";
      if (!expired && !waiting) {
        return {
          acquired: false,
          dispatchId: existing._id,
          reason: "duplicate" as const,
        };
      }
      if (expired) {
        await ctx.db.patch(existing._id, {
          reservationId: args.reservationId,
          correlationId: args.correlationId,
          policyHash: args.policyHash,
          effectivePolicy: args.effectivePolicy,
          definitionRefs: args.definitionRefs,
          leaseUntil: args.leaseUntil,
          updatedAt: args.now,
        });
        return {
          acquired: true,
          dispatchId: existing._id,
          reclaimed: true,
        };
      }
    }
    const active = await ctx.db
      .query("agencyDispatches")
      .withIndex("by_policy_status", (q) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("policyHash", args.policyHash)
          .eq("status", "reserved"),
      )
      .collect();
    const activeCount = active.filter(
      (dispatch) =>
        dispatch.leaseUntil !== undefined &&
        Date.parse(dispatch.leaseUntil) > Date.parse(args.now),
    ).length;
    if (activeCount >= args.maxConcurrentRuns) {
      const waiting = {
        tenantId: args.tenantId,
        idempotencyKey: args.idempotencyKey,
        loopId: args.loopId,
        decision: args.decision,
        status: "waiting-capacity" as const,
        correlationId: args.correlationId,
        policyHash: args.policyHash,
        effectivePolicy: args.effectivePolicy,
        definitionRefs: args.definitionRefs,
        updatedAt: args.now,
      };
      if (existing) await ctx.db.patch(existing._id, waiting);
      else
        await ctx.db.insert("agencyDispatches", {
          ...waiting,
          createdAt: args.now,
        });
      return {
        acquired: false,
        dispatchId: existing?._id,
        reason: "concurrency-limit" as const,
      };
    }
    let approvalId: string | undefined;
    if (args.requiresApproval) {
      const approvals = await ctx.db
        .query("agencyApprovals")
        .withIndex("by_scope", (q) =>
          q
            .eq("tenantId", args.tenantId)
            .eq("scopeKind", args.approvalScopeKind)
            .eq("scopeId", args.approvalScopeId)
            .eq("status", "available"),
        )
        .collect();
      const approval = approvals
        .filter(
          (candidate) =>
            (candidate.action === "*" ||
              candidate.action === args.approvalAction) &&
            (candidate.expiresAt === undefined ||
              Date.parse(candidate.expiresAt) > Date.parse(args.now)),
        )
        .sort((left, right) =>
          left.approvedAt.localeCompare(right.approvedAt),
        )[0];
      if (!approval) {
        const waiting = {
          tenantId: args.tenantId,
          idempotencyKey: args.idempotencyKey,
          loopId: args.loopId,
          decision: args.decision,
          status: "waiting-approval" as const,
          correlationId: args.correlationId,
          policyHash: args.policyHash,
          effectivePolicy: args.effectivePolicy,
          definitionRefs: args.definitionRefs,
          updatedAt: args.now,
        };
        if (existing) await ctx.db.patch(existing._id, waiting);
        else
          await ctx.db.insert("agencyDispatches", {
            ...waiting,
            createdAt: args.now,
          });
        return {
          acquired: false,
          dispatchId: existing?._id,
          reason: "approval-required" as const,
        };
      }
      approvalId = approval.approvalId;
      await ctx.db.patch(approval._id, {
        status: "consumed",
        consumedAt: args.now,
        dispatchKey: args.idempotencyKey,
      });
    }
    const reservation = {
      tenantId: args.tenantId,
      idempotencyKey: args.idempotencyKey,
      loopId: args.loopId,
      decision: args.decision,
      status: "reserved" as const,
      leaseUntil: args.leaseUntil,
      reservationId: args.reservationId,
      correlationId: args.correlationId,
      policyHash: args.policyHash,
      effectivePolicy: args.effectivePolicy,
      definitionRefs: args.definitionRefs,
      ...(approvalId ? { approvalId } : {}),
      updatedAt: args.now,
    };
    let dispatchId;
    if (existing) {
      await ctx.db.patch(existing._id, reservation);
      dispatchId = existing._id;
    } else {
      dispatchId = await ctx.db.insert("agencyDispatches", {
        ...reservation,
        createdAt: args.now,
      });
    }
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
        q
          .eq("tenantId", args.tenantId)
          .eq("idempotencyKey", args.idempotencyKey),
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
    reservationId: v.string(),
    status: v.union(
      v.literal("dispatched"),
      v.literal("failed"),
      v.literal("dead-letter"),
    ),
    runId: v.optional(v.string()),
    now: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agencyDispatches")
      .withIndex("by_tenant_key", (q) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("idempotencyKey", args.idempotencyKey),
      )
      .unique();
    if (!existing) throw new Error("Agency Dispatch reservation not found");
    if (existing.status !== "reserved")
      throw new Error("Agency Dispatch is already terminal");
    if (existing.reservationId !== args.reservationId) {
      throw new Error("Agency Dispatch reservation is stale");
    }
    await ctx.db.patch(existing._id, {
      status: args.status,
      ...(args.runId ? { runId: args.runId } : {}),
      updatedAt: args.now,
    });
  },
});

export const grantApproval = mutation({
  args: {
    serviceKey: v.optional(v.string()),
    tenantId: v.string(),
    approvalId: v.string(),
    scopeKind: v.union(
      v.literal("loop"),
      v.literal("goal"),
      v.literal("workflow"),
      v.literal("capability"),
    ),
    scopeId: v.string(),
    action: v.string(),
    approvedBy: v.string(),
    approvedAt: v.string(),
    expiresAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agencyApprovals")
      .withIndex("by_approval_id", (q) =>
        q.eq("tenantId", args.tenantId).eq("approvalId", args.approvalId),
      )
      .unique();
    if (existing) throw new Error("Agency Approval already exists");
    const { serviceKey: _serviceKey, ...approval } = args;
    return ctx.db.insert("agencyApprovals", {
      ...approval,
      status: "available",
    });
  },
});

export const listApprovals = query({
  args: {
    serviceKey: v.optional(v.string()),
    tenantId: v.string(),
    scopeKind: v.optional(
      v.union(
        v.literal("loop"),
        v.literal("goal"),
        v.literal("workflow"),
        v.literal("capability"),
      ),
    ),
    scopeId: v.optional(v.string()),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit)));
    const scopeKind = args.scopeKind;
    const scopeId = args.scopeId;
    if (scopeKind && scopeId) {
      return ctx.db
        .query("agencyApprovals")
        .withIndex("by_scope", (q) =>
          q
            .eq("tenantId", args.tenantId)
            .eq("scopeKind", scopeKind)
            .eq("scopeId", scopeId),
        )
        .order("desc")
        .take(limit);
    }
    return ctx.db
      .query("agencyApprovals")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .order("desc")
      .take(limit);
  },
});

export const revokeApproval = mutation({
  args: {
    serviceKey: v.optional(v.string()),
    tenantId: v.string(),
    approvalId: v.string(),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db
      .query("agencyApprovals")
      .withIndex("by_approval_id", (q) =>
        q.eq("tenantId", args.tenantId).eq("approvalId", args.approvalId),
      )
      .unique();
    if (!approval) throw new Error("Agency Approval not found");
    if (approval.status !== "available") {
      throw new Error("Only an available Agency Approval can be revoked");
    }
    await ctx.db.patch(approval._id, { status: "revoked" });
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
      v.literal("implementation"),
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
    stable(previous.execution) !== stable(next.execution) ||
    previous.parentRunId !== next.parentRunId ||
    stable(previous.effectivePolicy) !== stable(next.effectivePolicy)
  ) {
    throw new Error("Agency Run immutable context changed");
  }
}

export const getState = query({
  args: {
    serviceKey: v.optional(v.string()),
    tenantId: v.string(),
    kind: v.union(
      v.literal("intent"),
      v.literal("operation"),
      v.literal("goal"),
      v.literal("loop"),
    ),
    definitionId: v.string(),
  },
  handler: (ctx, args) =>
    ctx.db
      .query("agencyStates")
      .withIndex("by_tenant", (q) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("kind", args.kind)
          .eq("definitionId", args.definitionId),
      )
      .unique(),
});

export const listStates = query({
  args: { serviceKey: v.optional(v.string()), tenantId: v.string() },
  handler: (ctx, args) =>
    ctx.db
      .query("agencyStates")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect(),
});

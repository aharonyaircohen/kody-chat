import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { serviceMutation as mutation, serviceQuery as query } from "./lib/auth";

const WORK_KIND = "shared-work";
const workKey = (recordId: string) => `shared-work/${recordId}`;

const actorValidator = v.object({
  tokenId: v.string(),
  name: v.string(),
  actorLogin: v.string(),
});
const statusValidator = v.union(
  v.literal("planned"),
  v.literal("active"),
  v.literal("blocked"),
  v.literal("completed"),
  v.literal("cancelled"),
);
const eventTypeValidator = v.union(
  v.literal("update"),
  v.literal("checkpoint"),
  v.literal("evidence"),
  v.literal("decision"),
  v.literal("handoff"),
  v.literal("artifact"),
);
const WORK_STATUSES = new Set([
  "planned",
  "active",
  "blocked",
  "completed",
  "cancelled",
]);

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;
type Actor = { tokenId: string; name: string; actorLogin: string };
type WorkRecord = {
  recordId: string;
  repository: string;
  title: string;
  objective: string;
  status: "planned" | "active" | "blocked" | "completed" | "cancelled";
  revision: number;
  summary: string;
  goal?: string;
  tasks: string[];
  blockers: string[];
  checkpoints: Array<{ summary: string; recordedAt: string; actor: Actor }>;
  evidence: Array<{
    kind: string;
    reference: string;
    summary: string;
    recordedAt: string;
    actor: Actor;
  }>;
  decisions: Array<{
    summary: string;
    rationale?: string;
    recordedAt: string;
    actor: Actor;
  }>;
  artifacts: Array<{
    kind: string;
    reference: string;
    summary: string;
    recordedAt: string;
    actor: Actor;
  }>;
  handoff?: {
    toAgent: string;
    summary: string;
    nextSteps: string[];
    recordedAt: string;
    actor: Actor;
  };
  createdAt: string;
  updatedAt: string;
  updatedBy: Actor;
};

async function findWork(ctx: DbCtx, tenantId: string, recordId: string) {
  return await ctx.db
    .query("taskState")
    .withIndex("by_task", (q) =>
      q
        .eq("tenantId", tenantId)
        .eq("taskKey", workKey(recordId))
        .eq("kind", WORK_KIND),
    )
    .unique();
}

async function existingRequest(
  ctx: DbCtx,
  tenantId: string,
  actor: Actor,
  idempotencyKey: string,
  requestHash: string,
) {
  const row = await ctx.db
    .query("sharedWorkEvents")
    .withIndex("by_idempotency", (q) =>
      q
        .eq("tenantId", tenantId)
        .eq("actor.tokenId", actor.tokenId)
        .eq("idempotencyKey", idempotencyKey),
    )
    .unique();
  if (row && row.requestHash !== requestHash) {
    throw new Error("Idempotency key was already used with different input");
  }
  return row;
}

function requireObject(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Shared work event payload is invalid");
  }
  return payload as Record<string, unknown>;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Shared work ${field} is invalid`);
  }
  return value as string[];
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`Shared work ${field} is invalid`);
  return value.trim();
}

function applyEvent(
  current: WorkRecord,
  type:
    "update" | "checkpoint" | "evidence" | "decision" | "handoff" | "artifact",
  rawPayload: unknown,
  actor: Actor,
  occurredAt: string,
): WorkRecord {
  const payload = requireObject(rawPayload);
  const next: WorkRecord = {
    ...current,
    revision: current.revision + 1,
    updatedAt: occurredAt,
    updatedBy: actor,
  };
  if (type === "update") {
    if (payload.title !== undefined)
      next.title = requiredString(payload.title, "title");
    if (payload.objective !== undefined)
      next.objective = requiredString(payload.objective, "objective");
    if (payload.summary !== undefined)
      next.summary = requiredString(payload.summary, "summary");
    if (payload.goal !== undefined)
      next.goal = requiredString(payload.goal, "goal");
    if (payload.status !== undefined) {
      if (
        typeof payload.status !== "string" ||
        !WORK_STATUSES.has(payload.status)
      ) {
        throw new Error("Shared work status is invalid");
      }
      next.status = payload.status as WorkRecord["status"];
    }
    if (payload.tasks !== undefined)
      next.tasks = stringArray(payload.tasks, "tasks");
    if (payload.blockers !== undefined)
      next.blockers = stringArray(payload.blockers, "blockers");
  } else if (type === "checkpoint") {
    next.checkpoints = [
      ...current.checkpoints,
      {
        summary: requiredString(payload.summary, "checkpoint"),
        recordedAt: occurredAt,
        actor,
      },
    ];
  } else if (type === "evidence") {
    next.evidence = [
      ...current.evidence,
      {
        kind: requiredString(payload.kind, "evidence kind"),
        reference: requiredString(payload.reference, "evidence reference"),
        summary: requiredString(payload.summary, "evidence summary"),
        recordedAt: occurredAt,
        actor,
      },
    ];
  } else if (type === "decision") {
    next.decisions = [
      ...current.decisions,
      {
        summary: requiredString(payload.summary, "decision"),
        ...(payload.rationale === undefined
          ? {}
          : {
              rationale: requiredString(
                payload.rationale,
                "decision rationale",
              ),
            }),
        recordedAt: occurredAt,
        actor,
      },
    ];
  } else if (type === "artifact") {
    next.artifacts = [
      ...current.artifacts,
      {
        kind: requiredString(payload.kind, "artifact kind"),
        reference: requiredString(payload.reference, "artifact reference"),
        summary: requiredString(payload.summary, "artifact summary"),
        recordedAt: occurredAt,
        actor,
      },
    ];
  } else {
    next.handoff = {
      toAgent: requiredString(payload.toAgent, "handoff target"),
      summary: requiredString(payload.summary, "handoff summary"),
      nextSteps: stringArray(payload.nextSteps, "handoff next steps"),
      recordedAt: occurredAt,
      actor,
    };
  }
  return next;
}

async function insertEvent(
  ctx: MutationCtx,
  input: {
    tenantId: string;
    recordId: string;
    seq: number;
    type: string;
    payload: unknown;
    actor: Actor;
    actionId: string;
    idempotencyKey: string;
    requestHash: string;
    result: WorkRecord;
    occurredAt: string;
  },
): Promise<Id<"sharedWorkEvents">> {
  return await ctx.db.insert("sharedWorkEvents", input);
}

export const create = mutation({
  args: {
    tenantId: v.string(),
    recordId: v.string(),
    title: v.string(),
    objective: v.string(),
    status: v.optional(statusValidator),
    summary: v.optional(v.string()),
    goal: v.optional(v.string()),
    tasks: v.optional(v.array(v.string())),
    actor: actorValidator,
    idempotencyKey: v.string(),
    requestHash: v.string(),
  },
  handler: async (ctx, args) => {
    const retry = await existingRequest(
      ctx,
      args.tenantId,
      args.actor,
      args.idempotencyKey,
      args.requestHash,
    );
    if (retry) return retry.result as WorkRecord;
    if (await findWork(ctx, args.tenantId, args.recordId))
      throw new Error("Shared work already exists");
    const now = new Date().toISOString();
    const record: WorkRecord = {
      recordId: requiredString(args.recordId, "record ID"),
      repository: args.tenantId,
      title: requiredString(args.title, "title"),
      objective: requiredString(args.objective, "objective"),
      status: args.status ?? "active",
      revision: 1,
      summary: args.summary?.trim() ?? "",
      ...(args.goal?.trim() ? { goal: args.goal.trim() } : {}),
      tasks: args.tasks ?? [],
      blockers: [],
      checkpoints: [],
      evidence: [],
      decisions: [],
      artifacts: [],
      createdAt: now,
      updatedAt: now,
      updatedBy: args.actor,
    };
    await ctx.db.insert("taskState", {
      tenantId: args.tenantId,
      taskKey: workKey(args.recordId),
      kind: WORK_KIND,
      doc: record,
      updatedAt: now,
    });
    await insertEvent(ctx, {
      tenantId: args.tenantId,
      recordId: args.recordId,
      seq: 1,
      type: "created",
      payload: { title: record.title, objective: record.objective },
      actor: args.actor,
      actionId: "work.create",
      idempotencyKey: args.idempotencyKey,
      requestHash: args.requestHash,
      result: record,
      occurredAt: now,
    });
    return record;
  },
});

export const append = mutation({
  args: {
    tenantId: v.string(),
    recordId: v.string(),
    expectedRevision: v.number(),
    type: eventTypeValidator,
    payload: v.any(),
    actor: actorValidator,
    idempotencyKey: v.string(),
    requestHash: v.string(),
  },
  handler: async (ctx, args) => {
    const retry = await existingRequest(
      ctx,
      args.tenantId,
      args.actor,
      args.idempotencyKey,
      args.requestHash,
    );
    if (retry) return retry.result as WorkRecord;
    const row = await findWork(ctx, args.tenantId, args.recordId);
    if (!row) throw new Error("Shared work not found");
    const current = row.doc as WorkRecord;
    if (current.revision !== args.expectedRevision)
      throw new Error("Shared work changed since it was read");
    const now = new Date().toISOString();
    const next = applyEvent(current, args.type, args.payload, args.actor, now);
    await ctx.db.patch(row._id, { doc: next, updatedAt: now });
    await insertEvent(ctx, {
      tenantId: args.tenantId,
      recordId: args.recordId,
      seq: next.revision,
      type: args.type,
      payload: args.payload,
      actor: args.actor,
      actionId: `work.${args.type}`,
      idempotencyKey: args.idempotencyKey,
      requestHash: args.requestHash,
      result: next,
      occurredAt: now,
    });
    return next;
  },
});

export const get = query({
  args: { tenantId: v.string(), recordId: v.string() },
  handler: async (ctx, args) => {
    const row = await findWork(ctx, args.tenantId, args.recordId);
    if (!row) return null;
    const events = await ctx.db
      .query("sharedWorkEvents")
      .withIndex("by_work", (q) =>
        q.eq("tenantId", args.tenantId).eq("recordId", args.recordId),
      )
      .order("asc")
      .collect();
    return {
      record: row.doc as WorkRecord,
      events: events.map(
        ({ _id, _creationTime, requestHash, result, ...event }) => event,
      ),
    };
  },
});

export const list = query({
  args: {
    tenantId: v.string(),
    status: v.optional(statusValidator),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit)));
    const rows = await ctx.db
      .query("taskState")
      .withIndex("by_kind", (q) =>
        q.eq("tenantId", args.tenantId).eq("kind", WORK_KIND),
      )
      .order("desc")
      .take(args.status ? 500 : limit);
    const records = rows.map((row) => row.doc as WorkRecord);
    return (
      args.status
        ? records.filter((record) => record.status === args.status)
        : records
    ).slice(0, limit);
  },
});

export const remove = mutation({
  args: { tenantId: v.string(), recordId: v.string() },
  handler: async (ctx, args) => {
    const row = await findWork(ctx, args.tenantId, args.recordId);
    if (!row) return false;
    const events = await ctx.db
      .query("sharedWorkEvents")
      .withIndex("by_work", (q) =>
        q.eq("tenantId", args.tenantId).eq("recordId", args.recordId),
      )
      .collect();
    for (const event of events) await ctx.db.delete(event._id);
    await ctx.db.delete(row._id);
    return true;
  },
});

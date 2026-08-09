import { ConvexError, v } from "convex/values";

import { serviceMutation as mutation, serviceQuery as query } from "./lib/auth";
import type { MutationCtx } from "./_generated/server";

const definitionStatus = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("archived"),
);
const priority = v.union(
  v.literal("critical"),
  v.literal("high"),
  v.literal("normal"),
);
const scenarioKind = v.union(
  v.literal("happy"),
  v.literal("validation"),
  v.literal("permission"),
  v.literal("failure"),
  v.literal("recovery"),
  v.literal("persistence"),
);
const runStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("passed"),
  v.literal("failed"),
  v.literal("blocked"),
  v.literal("cancelled"),
);

async function findBySlug(
  ctx: Pick<MutationCtx, "db">,
  table: "qualityActions" | "qualityJourneys" | "qualityScenarios",
  tenantId: string,
  slug: string,
) {
  return await ctx.db
    .query(table)
    .withIndex("by_tenant", (q) =>
      q.eq("tenantId", tenantId).eq("slug", slug),
    )
    .unique();
}

export const getMap = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    const [actions, journeys, scenarios] = await Promise.all([
      ctx.db
        .query("qualityActions")
        .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
        .collect(),
      ctx.db
        .query("qualityJourneys")
        .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
        .collect(),
      ctx.db
        .query("qualityScenarios")
        .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
        .collect(),
    ]);
    return { actions, journeys, scenarios };
  },
});

export const saveAction = mutation({
  args: {
    tenantId: v.string(),
    slug: v.string(),
    name: v.string(),
    outcome: v.string(),
    area: v.string(),
    status: definitionStatus,
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await findBySlug(
      ctx,
      "qualityActions",
      args.tenantId,
      args.slug,
    );
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("qualityActions", args);
  },
});

export const removeAction = mutation({
  args: { tenantId: v.string(), slug: v.string() },
  handler: async (ctx, args) => {
    const action = await findBySlug(
      ctx,
      "qualityActions",
      args.tenantId,
      args.slug,
    );
    if (!action) return false;
    const journeys = await ctx.db
      .query("qualityJourneys")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();
    if (journeys.some((journey) => journey.actionSlugs.includes(args.slug)))
      throw new ConvexError("Action is referenced by a Journey");
    await ctx.db.delete(action._id);
    return true;
  },
});

export const saveJourney = mutation({
  args: {
    tenantId: v.string(),
    slug: v.string(),
    name: v.string(),
    goal: v.string(),
    priority,
    status: definitionStatus,
    actionSlugs: v.array(v.string()),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    for (const actionSlug of args.actionSlugs) {
      if (!(await findBySlug(ctx, "qualityActions", args.tenantId, actionSlug)))
        throw new ConvexError(`Unknown Action: ${actionSlug}`);
    }
    const existing = await findBySlug(
      ctx,
      "qualityJourneys",
      args.tenantId,
      args.slug,
    );
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("qualityJourneys", args);
  },
});

export const removeJourney = mutation({
  args: { tenantId: v.string(), slug: v.string() },
  handler: async (ctx, args) => {
    const journey = await findBySlug(
      ctx,
      "qualityJourneys",
      args.tenantId,
      args.slug,
    );
    if (!journey) return false;
    const scenarios = await ctx.db
      .query("qualityScenarios")
      .withIndex("by_journey", (q) =>
        q.eq("tenantId", args.tenantId).eq("journeySlug", args.slug),
      )
      .collect();
    if (scenarios.length > 0)
      throw new ConvexError("Journey is referenced by Scenarios");
    await ctx.db.delete(journey._id);
    return true;
  },
});

export const saveScenario = mutation({
  args: {
    tenantId: v.string(),
    slug: v.string(),
    journeySlug: v.string(),
    name: v.string(),
    kind: scenarioKind,
    given: v.string(),
    expectedVisible: v.string(),
    expectedState: v.string(),
    testId: v.optional(v.string()),
    cleanup: v.optional(v.string()),
    status: definitionStatus,
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    if (
      !(await findBySlug(
        ctx,
        "qualityJourneys",
        args.tenantId,
        args.journeySlug,
      ))
    )
      throw new ConvexError(`Unknown Journey: ${args.journeySlug}`);
    if (args.status === "active" && !args.testId)
      throw new ConvexError("Active Scenarios require an executable test");
    const existing = await findBySlug(
      ctx,
      "qualityScenarios",
      args.tenantId,
      args.slug,
    );
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("qualityScenarios", args);
  },
});

export const removeScenario = mutation({
  args: { tenantId: v.string(), slug: v.string() },
  handler: async (ctx, args) => {
    const scenario = await findBySlug(
      ctx,
      "qualityScenarios",
      args.tenantId,
      args.slug,
    );
    if (!scenario) return false;
    const run = await ctx.db
      .query("qualityRuns")
      .withIndex("by_scenario", (q) =>
        q.eq("tenantId", args.tenantId).eq("scenarioSlug", args.slug),
      )
      .first();
    if (run) throw new ConvexError("Scenario has immutable Quality Runs");
    await ctx.db.delete(scenario._id);
    return true;
  },
});

export const createRun = mutation({
  args: {
    tenantId: v.string(),
    runId: v.string(),
    runSlug: v.string(),
    journeySlug: v.string(),
    scenarioSlug: v.string(),
    environment: v.string(),
    targetUrl: v.string(),
    sourceCommit: v.string(),
    definitionUpdatedAt: v.string(),
    createdAt: v.string(),
    retryOfRunId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("qualityRuns")
      .withIndex("by_run", (q) =>
        q.eq("tenantId", args.tenantId).eq("runId", args.runId),
      )
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("qualityRuns", {
      ...args,
      status: "queued",
      updatedAt: args.createdAt,
    });
  },
});

export const updateRun = mutation({
  args: {
    tenantId: v.string(),
    runId: v.string(),
    status: runStatus,
    updatedAt: v.string(),
    startedAt: v.optional(v.string()),
    finishedAt: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("qualityRuns")
      .withIndex("by_run", (q) =>
        q.eq("tenantId", args.tenantId).eq("runId", args.runId),
      )
      .unique();
    if (!run) throw new ConvexError("Quality Run not found");
    const { tenantId: _tenantId, runId: _runId, ...patch } = args;
    await ctx.db.patch(run._id, patch);
    return run._id;
  },
});

export const appendRunEvent = mutation({
  args: {
    tenantId: v.string(),
    runId: v.string(),
    event: v.any(),
    time: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const duplicate = await ctx.db
      .query("qualityRunEvents")
      .withIndex("by_idempotency", (q) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("runId", args.runId)
          .eq("idempotencyKey", args.idempotencyKey),
      )
      .unique();
    if (duplicate) return duplicate._id;
    const latest = await ctx.db
      .query("qualityRunEvents")
      .withIndex("by_run", (q) =>
        q.eq("tenantId", args.tenantId).eq("runId", args.runId),
      )
      .order("desc")
      .first();
    return await ctx.db.insert("qualityRunEvents", {
      ...args,
      seq: (latest?.seq ?? -1) + 1,
    });
  },
});

export const getRun = query({
  args: { tenantId: v.string(), runId: v.string() },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("qualityRuns")
      .withIndex("by_run", (q) =>
        q.eq("tenantId", args.tenantId).eq("runId", args.runId),
      )
      .unique();
    if (!run) return null;
    const events = await ctx.db
      .query("qualityRunEvents")
      .withIndex("by_run", (q) =>
        q.eq("tenantId", args.tenantId).eq("runId", args.runId),
      )
      .order("asc")
      .collect();
    return { run, events };
  },
});

export const listRuns = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    const runs = await ctx.db
      .query("qualityRuns")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .take(100);
    return await Promise.all(
      runs.map(async (run) => {
        const latest = await ctx.db
          .query("qualityRunEvents")
          .withIndex("by_run", (q) =>
            q.eq("tenantId", tenantId).eq("runId", run.runId),
          )
          .order("desc")
          .first();
        return { ...run, latestEvent: latest?.event };
      }),
    );
  },
});

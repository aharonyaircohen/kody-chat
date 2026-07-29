import type { Id } from "./_generated/dataModel";
import { serviceMutation as mutation, serviceQuery as query } from "./lib/auth";
import { v } from "convex/values";

const MAX_DATA_BYTES = 64 * 1024 * 1024;
const TOOL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TOOL_NAME = /^[a-z][a-z0-9_]*$/;

function assertText(label: string, value: string, max: number): void {
  if (!value.trim() || value.length > max) {
    throw new Error(`${label} must contain 1-${max} characters`);
  }
}

function assertCount(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

async function findTool(
  ctx: { db: any },
  tenantId: string,
  toolId: string,
) {
  return await ctx.db
    .query("chatTools")
    .withIndex("by_tenant_tool", (q: any) =>
      q.eq("tenantId", tenantId).eq("toolId", toolId),
    )
    .unique();
}

export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) =>
    await ctx.db
      .query("chatTools")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
      .collect(),
});

export const getEnabled = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    const rows = await ctx.db
      .query("chatTools")
      .withIndex("by_tenant_enabled", (q) =>
        q.eq("tenantId", tenantId).eq("enabled", true),
      )
      .collect();
    return await Promise.all(
      rows.map(async (row) => ({
        ...row,
        dataUrl: await ctx.storage.getUrl(row.dataStorageId),
      })),
    );
  },
});

export const createUpload = mutation({
  args: { tenantId: v.string() },
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

export const publish = mutation({
  args: {
    tenantId: v.string(),
    toolId: v.string(),
    name: v.string(),
    title: v.string(),
    description: v.string(),
    handlerKind: v.literal("knowledge_graph_search"),
    dataStorageId: v.id("_storage"),
    dataSchemaVersion: v.number(),
    sourceWorkflow: v.string(),
    generatedAt: v.string(),
    nodeCount: v.number(),
    edgeCount: v.number(),
  },
  handler: async (ctx, args) => {
    if (!TOOL_ID.test(args.toolId)) throw new Error("toolId is invalid");
    if (!TOOL_NAME.test(args.name)) throw new Error("tool name is invalid");
    assertText("title", args.title, 100);
    assertText("description", args.description, 500);
    assertText("sourceWorkflow", args.sourceWorkflow, 200);
    assertCount("nodeCount", args.nodeCount);
    assertCount("edgeCount", args.edgeCount);
    if (!Number.isSafeInteger(args.dataSchemaVersion) || args.dataSchemaVersion < 1) {
      throw new Error("dataSchemaVersion must be a positive integer");
    }
    if (!Number.isFinite(Date.parse(args.generatedAt))) {
      throw new Error("generatedAt must be an ISO date");
    }
    const metadata = await ctx.db.system.get(args.dataStorageId);
    if (!metadata) throw new Error("Tool data file does not exist");
    if (metadata.size > MAX_DATA_BYTES) throw new Error("Tool data file is too large");

    const existing = await findTool(ctx, args.tenantId, args.toolId);
    const next = {
      ...args,
      enabled: existing?.enabled ?? false,
      updatedAt: new Date().toISOString(),
    };
    const id = existing
      ? (await ctx.db.patch(existing._id, next), existing._id)
      : await ctx.db.insert("chatTools", next);

    if (
      existing &&
      existing.dataStorageId !== args.dataStorageId &&
      (await ctx.db.system.get(existing.dataStorageId))
    ) {
      await ctx.storage.delete(existing.dataStorageId);
    }
    return id;
  },
});

export const setEnabled = mutation({
  args: {
    tenantId: v.string(),
    toolId: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await findTool(ctx, args.tenantId, args.toolId);
    if (!existing) throw new Error("Chat tool not found");
    await ctx.db.patch(existing._id, {
      enabled: args.enabled,
      updatedAt: new Date().toISOString(),
    });
  },
});

export const remove = mutation({
  args: { tenantId: v.string(), toolId: v.string() },
  handler: async (ctx, args) => {
    const existing = await findTool(ctx, args.tenantId, args.toolId);
    if (!existing) return false;
    await ctx.db.delete(existing._id);
    if (await ctx.db.system.get(existing.dataStorageId)) {
      await ctx.storage.delete(existing.dataStorageId);
    }
    return true;
  },
});

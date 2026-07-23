import type { Id } from "./_generated/dataModel";
import { serviceMutation as mutation, serviceQuery as query } from "./lib/auth";
import { v } from "convex/values";

const MAX_GRAPH_BYTES = 64 * 1024 * 1024;
const MAX_REPORT_BYTES = 16 * 1024 * 1024;
const MAX_HTML_BYTES = 64 * 1024 * 1024;

function assertCount(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
}

async function requireStoredFile(
  ctx: {
    db: {
      system: {
        get: (id: Id<"_storage">) => Promise<{
          size: number;
          contentType?: string;
        } | null>;
      };
    };
  },
  id: Id<"_storage">,
  label: string,
  maxBytes: number,
): Promise<void> {
  const metadata = await ctx.db.system.get(id);
  if (!metadata) throw new Error(`${label} file does not exist`);
  if (metadata.size > maxBytes) {
    throw new Error(`${label} file exceeds the ${maxBytes} byte limit`);
  }
}

export const get = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    const bundle = await ctx.db
      .query("knowledgeGraphs")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
      .unique();
    if (!bundle) return null;

    const [graphUrl, reportUrl, htmlUrl] = await Promise.all([
      ctx.storage.getUrl(bundle.graphStorageId),
      bundle.reportStorageId
        ? ctx.storage.getUrl(bundle.reportStorageId)
        : Promise.resolve(null),
      bundle.htmlStorageId
        ? ctx.storage.getUrl(bundle.htmlStorageId)
        : Promise.resolve(null),
    ]);
    if (!graphUrl) return null;

    return { ...bundle, graphUrl, reportUrl, htmlUrl };
  },
});

export const createUpload = mutation({
  args: { tenantId: v.string() },
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

export const publish = mutation({
  args: {
    tenantId: v.string(),
    graphStorageId: v.id("_storage"),
    reportStorageId: v.optional(v.id("_storage")),
    htmlStorageId: v.optional(v.id("_storage")),
    generatedAt: v.string(),
    sourceRevision: v.optional(v.string()),
    nodeCount: v.number(),
    edgeCount: v.number(),
    schemaVersion: v.number(),
  },
  handler: async (ctx, args) => {
    assertCount("nodeCount", args.nodeCount);
    assertCount("edgeCount", args.edgeCount);
    if (!Number.isSafeInteger(args.schemaVersion) || args.schemaVersion < 1) {
      throw new Error("schemaVersion must be a positive integer");
    }
    if (!Number.isFinite(Date.parse(args.generatedAt))) {
      throw new Error("generatedAt must be an ISO date");
    }

    await requireStoredFile(
      ctx,
      args.graphStorageId,
      "Knowledge graph",
      MAX_GRAPH_BYTES,
    );
    if (args.reportStorageId) {
      await requireStoredFile(
        ctx,
        args.reportStorageId,
        "Knowledge report",
        MAX_REPORT_BYTES,
      );
    }
    if (args.htmlStorageId) {
      await requireStoredFile(
        ctx,
        args.htmlStorageId,
        "Knowledge visualization",
        MAX_HTML_BYTES,
      );
    }

    const existing = await ctx.db
      .query("knowledgeGraphs")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .unique();
    const updatedAt = new Date().toISOString();
    const next = { ...args, updatedAt };

    let id;
    if (existing) {
      await ctx.db.patch(existing._id, next);
      id = existing._id;
    } else {
      id = await ctx.db.insert("knowledgeGraphs", next);
    }

    const retained = new Set<Id<"_storage">>([
      args.graphStorageId,
      ...(args.reportStorageId ? [args.reportStorageId] : []),
      ...(args.htmlStorageId ? [args.htmlStorageId] : []),
    ]);
    if (existing) {
      const oldFiles = [
        existing.graphStorageId,
        existing.reportStorageId,
        existing.htmlStorageId,
      ].filter((file): file is Id<"_storage"> => Boolean(file));
      for (const file of oldFiles) {
        if (!retained.has(file)) await ctx.storage.delete(file);
      }
    }
    return id;
  },
});

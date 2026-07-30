import { serviceMutation as mutation, serviceQuery as query } from "./lib/auth";
import { v } from "convex/values";

// Singleton per-tenant documents keyed by `kind`: dashboard config, system
// prompt, instructions, context docs.

export const get = query({
  args: { tenantId: v.string(), kind: v.string() },
  handler: async (ctx, { tenantId, kind }) => {
    return await ctx.db
      .query("repoDocs")
      .withIndex("by_kind", (q) => q.eq("tenantId", tenantId).eq("kind", kind))
      .unique();
  },
});

// Every doc whose kind starts with `prefix` (e.g. "context:", "operation:").
// The by_kind index is range-scanned, so this never reads other kinds.
export const listByPrefix = query({
  args: { tenantId: v.string(), prefix: v.string() },
  handler: async (ctx, { tenantId, prefix }) => {
    return await ctx.db
      .query("repoDocs")
      .withIndex("by_kind", (q) =>
        q.eq("tenantId", tenantId).gte("kind", prefix).lt("kind", `${prefix}￿`),
      )
      .take(100);
  },
});

export const save = mutation({
  args: {
    tenantId: v.string(),
    kind: v.string(),
    doc: v.any(),
    updatedAt: v.string(),
    expectedUpdatedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("repoDocs")
      .withIndex("by_kind", (q) =>
        q.eq("tenantId", args.tenantId).eq("kind", args.kind),
      )
      .unique();
    if (existing) {
      if (
        args.expectedUpdatedAt !== undefined &&
        existing.updatedAt !== args.expectedUpdatedAt
      ) {
        throw new Error("Repository document changed since it was read");
      }
      await ctx.db.patch(existing._id, {
        doc: args.doc,
        updatedAt: args.updatedAt,
      });
      return existing._id;
    }
    return await ctx.db.insert("repoDocs", args);
  },
});

export const remove = mutation({
  args: { tenantId: v.string(), kind: v.string() },
  handler: async (ctx, { tenantId, kind }) => {
    const existing = await ctx.db
      .query("repoDocs")
      .withIndex("by_kind", (q) => q.eq("tenantId", tenantId).eq("kind", kind))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

/** Save one document and remove another in the same Convex transaction. */
export const saveAndRemove = mutation({
  args: {
    tenantId: v.string(),
    saveKind: v.string(),
    doc: v.any(),
    updatedAt: v.string(),
    removeKind: v.string(),
  },
  handler: async (ctx, args) => {
    const [saved, removed] = await Promise.all([
      ctx.db
        .query("repoDocs")
        .withIndex("by_kind", (q) =>
          q.eq("tenantId", args.tenantId).eq("kind", args.saveKind),
        )
        .unique(),
      ctx.db
        .query("repoDocs")
        .withIndex("by_kind", (q) =>
          q.eq("tenantId", args.tenantId).eq("kind", args.removeKind),
        )
        .unique(),
    ]);
    if (saved) {
      await ctx.db.patch(saved._id, {
        doc: args.doc,
        updatedAt: args.updatedAt,
      });
    } else {
      await ctx.db.insert("repoDocs", {
        tenantId: args.tenantId,
        kind: args.saveKind,
        doc: args.doc,
        updatedAt: args.updatedAt,
      });
    }
    if (removed) await ctx.db.delete(removed._id);
  },
});

/** Remove one document and optionally save another in one transaction. */
export const removeAndMaybeSave = mutation({
  args: {
    tenantId: v.string(),
    removeKind: v.string(),
    save: v.optional(
      v.object({
        kind: v.string(),
        doc: v.any(),
        updatedAt: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const removed = await ctx.db
      .query("repoDocs")
      .withIndex("by_kind", (q) =>
        q.eq("tenantId", args.tenantId).eq("kind", args.removeKind),
      )
      .unique();
    if (removed) await ctx.db.delete(removed._id);
    if (!args.save) return;
    const saved = await ctx.db
      .query("repoDocs")
      .withIndex("by_kind", (q) =>
        q.eq("tenantId", args.tenantId).eq("kind", args.save!.kind),
      )
      .unique();
    if (saved) {
      await ctx.db.patch(saved._id, {
        doc: args.save.doc,
        updatedAt: args.save.updatedAt,
      });
    } else {
      await ctx.db.insert("repoDocs", {
        tenantId: args.tenantId,
        kind: args.save.kind,
        doc: args.save.doc,
        updatedAt: args.save.updatedAt,
      });
    }
  },
});

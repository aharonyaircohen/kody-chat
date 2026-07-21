import { v } from "convex/values";
import { serviceMutation as mutation, serviceQuery as query } from "./lib/auth";

/** Publish a new widget version — the version bump happens in one transaction. */
export const publish = mutation({
  args: {
    tenantId: v.string(),
    slug: v.string(),
    bundle: v.string(),
    commitSha: v.optional(v.string()),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("widgets")
      .withIndex("by_widget", (q) =>
        q.eq("tenantId", args.tenantId).eq("slug", args.slug),
      )
      .order("desc")
      .first();
    const version = (latest?.version ?? 0) + 1;
    await ctx.db.insert("widgets", { ...args, version });
    return version;
  },
});

export const latest = query({
  args: { tenantId: v.string(), slug: v.string() },
  handler: async (ctx, { tenantId, slug }) =>
    await ctx.db
      .query("widgets")
      .withIndex("by_widget", (q) => q.eq("tenantId", tenantId).eq("slug", slug))
      .order("desc")
      .first(),
});

/** Latest version per slug for a tenant. */
export const list = query({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    const rows = await ctx.db
      .query("widgets")
      .withIndex("by_widget", (q) => q.eq("tenantId", tenantId))
      .collect();
    const bySlug = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const current = bySlug.get(row.slug);
      if (!current || row.version > current.version) bySlug.set(row.slug, row);
    }
    return [...bySlug.values()].map(({ bundle, ...meta }) => ({
      ...meta,
      bundleSize: bundle.length,
    }));
  },
});

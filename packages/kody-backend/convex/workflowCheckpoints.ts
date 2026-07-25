import { v } from "convex/values"
import type { QueryCtx } from "./_generated/server"
import { serviceMutation, serviceQuery } from "./lib/auth"

const checkpointKey = {
  tenantId: v.string(),
  threadId: v.string(),
  checkpointNs: v.string(),
}

const checkpointWriteValidator = v.object({
  taskId: v.string(),
  idx: v.number(),
  channel: v.string(),
  valueType: v.string(),
  value: v.string(),
})

export const get = serviceQuery({
  args: {
    ...checkpointKey,
    checkpointId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const checkpoint = args.checkpointId
      ? await ctx.db
          .query("workflowCheckpoints")
          .withIndex("by_checkpoint", (q) =>
            q
              .eq("tenantId", args.tenantId)
              .eq("threadId", args.threadId)
              .eq("checkpointNs", args.checkpointNs)
              .eq("checkpointId", args.checkpointId!),
          )
          .unique()
      : await ctx.db
          .query("workflowCheckpoints")
          .withIndex("by_checkpoint", (q) =>
            q
              .eq("tenantId", args.tenantId)
              .eq("threadId", args.threadId)
              .eq("checkpointNs", args.checkpointNs),
          )
          .order("desc")
          .first()
    if (!checkpoint) return null
    return {
      ...checkpoint,
      writes: await checkpointWrites(
        ctx,
        args.tenantId,
        args.threadId,
        args.checkpointNs,
        checkpoint.checkpointId,
      ),
    }
  },
})

export const list = serviceQuery({
  args: {
    ...checkpointKey,
    beforeCheckpointId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 500)))
    const rows = await ctx.db
      .query("workflowCheckpoints")
      .withIndex("by_checkpoint", (q) => {
        const key = q
          .eq("tenantId", args.tenantId)
          .eq("threadId", args.threadId)
          .eq("checkpointNs", args.checkpointNs)
        return args.beforeCheckpointId
          ? key.lt("checkpointId", args.beforeCheckpointId)
          : key
      })
      .order("desc")
      .take(limit)
    return await Promise.all(
      rows.map(async (row) => ({
        ...row,
        writes: await checkpointWrites(
          ctx,
          args.tenantId,
          args.threadId,
          args.checkpointNs,
          row.checkpointId,
        ),
      })),
    )
  },
})

export const save = serviceMutation({
  args: {
    ...checkpointKey,
    checkpointId: v.string(),
    parentCheckpointId: v.optional(v.string()),
    checkpointType: v.string(),
    checkpoint: v.string(),
    metadataType: v.string(),
    metadata: v.string(),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("workflowCheckpoints")
      .withIndex("by_checkpoint", (q) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("threadId", args.threadId)
          .eq("checkpointNs", args.checkpointNs)
          .eq("checkpointId", args.checkpointId),
      )
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, {
        parentCheckpointId: args.parentCheckpointId,
        checkpointType: args.checkpointType,
        checkpoint: args.checkpoint,
        metadataType: args.metadataType,
        metadata: args.metadata,
        updatedAt: args.updatedAt,
      })
      return existing._id
    }
    return await ctx.db.insert("workflowCheckpoints", args)
  },
})

export const saveWrites = serviceMutation({
  args: {
    ...checkpointKey,
    checkpointId: v.string(),
    writes: v.array(checkpointWriteValidator),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    for (const write of args.writes) {
      const existing = await ctx.db
        .query("workflowCheckpointWrites")
        .withIndex("by_write", (q) =>
          q
            .eq("tenantId", args.tenantId)
            .eq("threadId", args.threadId)
            .eq("checkpointNs", args.checkpointNs)
            .eq("checkpointId", args.checkpointId)
            .eq("taskId", write.taskId)
            .eq("idx", write.idx),
        )
        .unique()
      if (existing) {
        if (write.idx < 0) {
          await ctx.db.patch(existing._id, {
            channel: write.channel,
            valueType: write.valueType,
            value: write.value,
            updatedAt: args.updatedAt,
          })
        }
        continue
      }
      await ctx.db.insert("workflowCheckpointWrites", {
        tenantId: args.tenantId,
        threadId: args.threadId,
        checkpointNs: args.checkpointNs,
        checkpointId: args.checkpointId,
        ...write,
        updatedAt: args.updatedAt,
      })
    }
  },
})

export const deleteThread = serviceMutation({
  args: {
    tenantId: v.string(),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const checkpoints = await ctx.db
      .query("workflowCheckpoints")
      .withIndex("by_tenant_thread", (q) =>
        q.eq("tenantId", args.tenantId).eq("threadId", args.threadId),
      )
      .take(200)
    const writes = await ctx.db
      .query("workflowCheckpointWrites")
      .withIndex("by_tenant_thread", (q) =>
        q.eq("tenantId", args.tenantId).eq("threadId", args.threadId),
      )
      .take(200)
    for (const row of checkpoints) await ctx.db.delete(row._id)
    for (const row of writes) await ctx.db.delete(row._id)
    const checkpointRemains = await ctx.db
      .query("workflowCheckpoints")
      .withIndex("by_tenant_thread", (q) =>
        q.eq("tenantId", args.tenantId).eq("threadId", args.threadId),
      )
      .first()
    const writeRemains = await ctx.db
      .query("workflowCheckpointWrites")
      .withIndex("by_tenant_thread", (q) =>
        q.eq("tenantId", args.tenantId).eq("threadId", args.threadId),
      )
      .first()
    return {
      deleted: checkpoints.length + writes.length,
      hasMore: Boolean(checkpointRemains || writeRemains),
    }
  },
})

async function checkpointWrites(
  ctx: Pick<QueryCtx, "db">,
  tenantId: string,
  threadId: string,
  checkpointNs: string,
  checkpointId: string,
) {
  const writes = await ctx.db
    .query("workflowCheckpointWrites")
    .withIndex("by_checkpoint", (q) =>
      q
        .eq("tenantId", tenantId)
        .eq("threadId", threadId)
        .eq("checkpointNs", checkpointNs)
        .eq("checkpointId", checkpointId),
    )
    .collect()
  return writes.sort(
    (left, right) =>
      left.idx - right.idx || left.taskId.localeCompare(right.taskId),
  )
}

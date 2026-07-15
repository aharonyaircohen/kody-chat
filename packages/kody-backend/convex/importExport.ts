import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import type { TableNames } from "./_generated/dataModel"
import { IMPORTABLE_TABLES } from "../src/entities"

// DB-agnostic migration surface. The export format is plain JSON:
// { table: string, docs: object[] } chunks — produced by scripts/export-github.ts
// and consumed here, so the same dump can seed any future backend.

const TABLES = IMPORTABLE_TABLES

function assertTable(table: string): asserts table is TableNames {
  if (!TABLES.includes(table)) {
    throw new Error(`Unknown table for import: ${table}`)
  }
}

export const importChunk = mutation({
  args: { table: v.string(), docs: v.array(v.any()) },
  handler: async (ctx, { table, docs }) => {
    assertTable(table)
    for (const doc of docs) {
      await ctx.db.insert(table as TableNames, doc)
    }
    return { inserted: docs.length }
  },
})

// Wipes a tenant's rows before a re-import (dry runs on a test deployment).
export const clearRepo = mutation({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    let deleted = 0
    for (const table of TABLES) {
      if (table === "actionStates" || table === "eventLog") continue // global tables
      const docs = await ctx.db
        .query(table as TableNames)
        .filter((q) => q.eq(q.field("tenantId"), tenantId))
        .collect()
      for (const doc of docs) {
        await ctx.db.delete(doc._id)
        deleted++
      }
    }
    return { deleted }
  },
})

export const exportTable = query({
  args: { table: v.string(), tenantId: v.optional(v.string()) },
  handler: async (ctx, { table, tenantId }) => {
    assertTable(table)
    let q = ctx.db.query(table as TableNames)
    const docs = tenantId
      ? await q.filter((f) => f.eq(f.field("tenantId"), tenantId)).collect()
      : await q.collect()
    return docs.map(({ _id, _creationTime, ...rest }) => rest)
  },
})

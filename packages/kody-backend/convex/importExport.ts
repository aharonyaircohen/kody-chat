import { mutation, query } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import { v } from "convex/values"
import type { Doc, TableNames } from "./_generated/dataModel"
import { ENTITIES, IMPORTABLE_TABLES } from "../src/entities"
import type { EntityDef } from "../src/entities"

// DB-agnostic migration surface. The export format is plain JSON:
// { table: string, docs: object[] } chunks — produced by scripts/export-github.ts
// and consumed here, so the same dump can seed any future backend.

const TABLES = IMPORTABLE_TABLES

const ENTITY_BY_TABLE = new Map(ENTITIES.map((e) => [e.table, e]))

function assertTable(table: string): asserts table is TableNames {
  if (!TABLES.includes(table)) {
    throw new Error(`Unknown table for import: ${table}`)
  }
}

/** tenantId (unless global) + the entity's natural key — the identity an upsert matches on. */
function keyFields(entity: EntityDef): string[] {
  return entity.global ? entity.naturalKey : ["tenantId", ...entity.naturalKey]
}

async function findByNaturalKey(
  ctx: MutationCtx,
  entity: EntityDef,
  doc: Record<string, unknown>,
): Promise<Doc<TableNames> | null> {
  const table = entity.table as TableNames
  const fields = keyFields(entity)
  if (entity.upsertIndex) {
    // Index names/fields are dynamic (registry-driven), so the typed builder is widened.
    type EqRange = { eq: (field: string, value: unknown) => EqRange }
    const q = ctx.db.query(table) as unknown as {
      withIndex: (
        name: string,
        range: (q: EqRange) => EqRange,
      ) => { first: () => Promise<Doc<TableNames> | null> }
    }
    return await q
      .withIndex(entity.upsertIndex, (range) =>
        fields.reduce((acc, field) => acc.eq(field, doc[field]), range),
      )
      .first()
  }
  return await ctx.db
    .query(table)
    .filter((q) => q.and(...fields.map((field) => q.eq(q.field(field as "tenantId"), doc[field] as string))))
    .first()
}

// Upserts by each entity's natural key (tenantId + naturalKey from the entity
// registry) so partial or repeated imports never duplicate rows.
export const importChunk = mutation({
  args: { table: v.string(), docs: v.array(v.any()) },
  handler: async (ctx, { table, docs }) => {
    assertTable(table)
    const entity = ENTITY_BY_TABLE.get(table)
    if (!entity) throw new Error(`No entity registered for table: ${table}`)
    let inserted = 0
    let updated = 0
    for (const doc of docs) {
      const existing = await findByNaturalKey(ctx, entity, doc as Record<string, unknown>)
      if (existing) {
        await ctx.db.replace(existing._id, doc)
        updated++
      } else {
        await ctx.db.insert(table as TableNames, doc)
        inserted++
      }
    }
    return { inserted, updated }
  },
})

// Repairs historical duplicate rows left by the old insert-only import: per
// table, groups the tenant's rows by natural key and keeps only the newest
// (highest _creationTime) row. Global tables are left untouched.
// Pass `table` to dedupe one table per transaction — a whole tenant across all
// tables can exceed the 16MB per-mutation read limit on real data.
export const dedupeTenant = mutation({
  args: { tenantId: v.string(), table: v.optional(v.string()) },
  handler: async (ctx, { tenantId, table }) => {
    if (table) assertTable(table)
    const results: Record<string, { before: number; after: number; deleted: number }> = {}
    for (const entity of ENTITIES) {
      if (entity.global) continue
      if (table && entity.table !== table) continue
      const docs = await ctx.db
        .query(entity.table as TableNames)
        .filter((q) => q.eq(q.field("tenantId"), tenantId))
        .collect()
      const byKey = new Map<string, Doc<TableNames>[]>()
      for (const doc of docs) {
        const key = JSON.stringify(
          entity.naturalKey.map((f) => (doc as Record<string, unknown>)[f] ?? null),
        )
        byKey.set(key, [...(byKey.get(key) ?? []), doc])
      }
      let deleted = 0
      for (const group of byKey.values()) {
        if (group.length < 2) continue
        const sorted = [...group].sort((a, b) => b._creationTime - a._creationTime)
        for (const stale of sorted.slice(1)) {
          await ctx.db.delete(stale._id)
          deleted++
        }
      }
      results[entity.table] = { before: docs.length, after: docs.length - deleted, deleted }
    }
    return results
  },
})

// Wipes a tenant's rows before a re-import (dry runs on a test deployment).
export const clearRepo = mutation({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    let deleted = 0
    for (const table of TABLES) {
      if (ENTITY_BY_TABLE.get(table)?.global) continue
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

import { describe, expect, it } from "vitest"
import schema from "../../convex/schema"
import { ENTITIES, IMPORTABLE_TABLES, STATE_ROOTS } from "../../src/entities"

// Drift guard: every schema table must be registered in src/entities.ts and
// vice versa. If this fails you added a table or an entity in only one place —
// register it in the entity registry, never in downstream lists.
describe("entity registry drift", () => {
  const schemaTables = Object.keys(schema.tables).sort()
  const registryTables = [...IMPORTABLE_TABLES].sort()

  it("covers every schema table", () => {
    expect(registryTables).toEqual(schemaTables)
  })

  it("has no duplicate table entries", () => {
    const tables = ENTITIES.map((e) => e.table)
    expect(new Set(tables).size).toBe(tables.length)
  })

  it("every file-sourced entity declares its state paths", () => {
    for (const entity of ENTITIES) {
      if (entity.map) {
        expect(entity.statePaths.length, `${entity.table} has a mapper but no statePaths`)
          .toBeGreaterThan(0)
      }
    }
  })

  it("derives a stable export walk list", () => {
    expect(STATE_ROOTS).toContain("workflows")
    expect(STATE_ROOTS).toContain("agency")
    expect(new Set(STATE_ROOTS).size).toBe(STATE_ROOTS.length)
  })
})

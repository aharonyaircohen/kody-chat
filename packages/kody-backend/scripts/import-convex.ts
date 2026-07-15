/**
 * Imports a JSON dump (produced by export-github.ts) into a Convex deployment.
 *
 * Usage:
 *   CONVEX_URL=https://….convex.cloud pnpm --filter @kody-ade/backend import:convex \
 *     [--dir ./dump] [--clear-tenantId owner/name]
 *
 * Chunks each table's docs through importExport:importChunk. Pass --clear-tenantId
 * to wipe that tenantId's rows first (safe re-runs on a test deployment).
 */
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { ConvexHttpClient } from "convex/browser"
import { anyApi } from "convex/server"

const url = process.env.CONVEX_URL
if (!url) {
  console.error("CONVEX_URL not configured")
  process.exit(1)
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const dir = argValue("--dir") ?? "./dump"
const clearRepo = argValue("--clear-tenantId")
const CHUNK_SIZE = 200

const client = new ConvexHttpClient(url)

if (clearRepo) {
  const result = await client.mutation(anyApi.importExport.clearRepo, { tenantId: clearRepo })
  console.log(`cleared ${result.deleted} rows for ${clearRepo}`)
}

const files = (await readdir(dir)).filter((f) => f.endsWith(".json"))
for (const file of files) {
  const { table, docs } = JSON.parse(await readFile(join(dir, file), "utf8")) as {
    table: string
    docs: Array<Record<string, unknown>>
  }
  let inserted = 0
  for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
    const chunk = docs.slice(i, i + CHUNK_SIZE)
    await client.mutation(anyApi.importExport.importChunk, { table, docs: chunk })
    inserted += chunk.length
  }
  console.log(`${table}: imported ${inserted} docs`)
}
console.log("import complete")

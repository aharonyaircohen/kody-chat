/**
 * Exports the GitHub state repo into a DB-agnostic JSON dump.
 *
 * Usage:
 *   GITHUB_TOKEN=… STATE_REPO=owner/state-repo REPO=owner/consumer-repo \
 *     pnpm --filter @kody-ade/backend export:github [--branch main] [--out ./dump]
 *
 * Output: <out>/<table>.json files, each `{ table, docs: [...] }` — the format
 * convex/importExport.ts:importChunk consumes. The dump is plain JSON so it can
 * seed any future backend, not just Convex.
 */
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { mapStateFile } from "../src/export-mapping.ts"

const token = process.env.GITHUB_TOKEN
const stateRepo = process.env.STATE_REPO
const repo = process.env.REPO
const branch = argValue("--branch") ?? "main"
const outDir = argValue("--out") ?? "./dump"

if (!token || !stateRepo || !repo) {
  console.error("Required env: GITHUB_TOKEN, STATE_REPO (owner/name), REPO (owner/name)")
  process.exit(1)
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function gh(path: string): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
    },
  })
}

async function listTree(): Promise<Array<{ path: string; type: string }>> {
  const res = await gh(`/repos/${stateRepo}/git/trees/${branch}?recursive=1`)
  if (!res.ok) throw new Error(`tree fetch failed: ${res.status} ${await res.text()}`)
  const body = (await res.json()) as { tree: Array<{ path: string; type: string }> }
  return body.tree.filter((e) => e.type === "blob")
}

async function readFileText(path: string): Promise<string> {
  const res = await gh(
    `/repos/${stateRepo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${branch}`,
  )
  if (!res.ok) throw new Error(`read failed for ${path}: ${res.status}`)
  const body = (await res.json()) as { content: string; encoding: string }
  return Buffer.from(body.content, "base64").toString("utf8")
}

const tables: Record<string, Array<Record<string, unknown>>> = {}
const now = new Date().toISOString()

const entries = await listTree()
console.log(`state repo ${stateRepo}@${branch}: ${entries.length} files`)
for (const entry of entries) {
  try {
    const rows = mapStateFile(entry.path, await readFileText(entry.path), repo, now)
    if (!rows) {
      console.warn(`skipped (no mapping): ${entry.path}`)
      continue
    }
    for (const { table, doc } of rows) {
      tables[table] = [...(tables[table] ?? []), doc]
    }
  } catch (error) {
    console.error(`failed on ${entry.path}:`, error)
    process.exitCode = 1
  }
}

await mkdir(outDir, { recursive: true })
for (const [table, docs] of Object.entries(tables)) {
  const file = join(outDir, `${table}.json`)
  await writeFile(file, JSON.stringify({ table, docs }, null, 2))
  console.log(`wrote ${file} (${docs.length} docs)`)
}

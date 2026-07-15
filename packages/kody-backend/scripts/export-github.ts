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

function parseJsonl(text: string): unknown[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l))
}

type Doc = Record<string, unknown>
const tables: Record<string, Doc[]> = {}
function add(table: string, doc: Doc): void {
  tables[table] = [...(tables[table] ?? []), doc]
}

// Maps a state-repo file path to table rows. Extend as new entity kinds land.
async function ingest(path: string): Promise<void> {
  const now = new Date().toISOString()
  const text = await readFileText(path)

  let m: RegExpMatchArray | null
  if ((m = path.match(/^workflows\/([^/]+)\/workflow\.json$/))) {
    const definition = JSON.parse(text) as { updatedAt?: string }
    add("workflows", {
      repo,
      workflowId: m[1],
      definition,
      source: "local",
      updatedAt: definition.updatedAt ?? now,
    })
  } else if ((m = path.match(/^workflows\/([^/]+)\/runs\/([^/]+)\.json$/))) {
    add("workflowRuns", { repo, workflowId: m[1], runId: m[2], state: JSON.parse(text), updatedAt: now })
  } else if ((m = path.match(/^sessions\/([^/]+)\.jsonl$/))) {
    const [meta, ...turns] = parseJsonl(text)
    add("chatSessions", { repo, sessionId: m[1], meta: meta ?? {}, updatedAt: now })
    turns.forEach((turn, seq) => add("chatTurns", { repo, sessionId: m![1], seq, turn }))
  } else if ((m = path.match(/^events\/([^/]+)\.jsonl$/))) {
    parseJsonl(text).forEach((event, seq) =>
      add("chatEvents", { repo, sessionId: m![1], seq, event }),
    )
  } else if ((m = path.match(/^intents\/([^/]+)\/intent\.json$/))) {
    const intent = JSON.parse(text) as { updatedAt?: string }
    add("intents", { repo, intentId: m[1], intent, updatedAt: intent.updatedAt ?? now })
  } else if ((m = path.match(/^intents\/([^/]+)\/decisions\.jsonl$/))) {
    parseJsonl(text).forEach((decision, seq) =>
      add("intentDecisions", { repo, intentId: m![1], seq, decision }),
    )
  } else if ((m = path.match(/^todos\/([^/]+)\.json$/))) {
    add("goals", { repo, goalId: m[1], state: JSON.parse(text), updatedAt: now })
  } else if ((m = path.match(/^reports\/([^/]+)\/runs\/([^/]+)\.md$/))) {
    add("reports", { repo, slug: m[1], runId: m[2], body: text, meta: {}, updatedAt: now })
  } else if ((m = path.match(/^reports\/([^/]+)\.md$/))) {
    add("reports", { repo, slug: m[1], body: text, meta: {}, updatedAt: now })
  } else if ((m = path.match(/^agents\/([^/]+)\.md$/))) {
    add("agents", { repo, slug: m[1], frontmatter: {}, body: text, updatedAt: now })
  } else if ((m = path.match(/^views\/renderers\/([^/]+)\.json$/))) {
    add("viewRenderers", { repo, slug: m[1], definition: JSON.parse(text), updatedAt: now })
  } else if (path === "macros.json") {
    const parsed = JSON.parse(text) as { macros?: Array<{ id: string }> }
    for (const macro of parsed.macros ?? []) {
      add("macros", { repo, macroId: macro.id, macro })
    }
  } else if (path === "dashboard.json") {
    add("repoDocs", { repo, kind: "dashboard-config", doc: JSON.parse(text), updatedAt: now })
  } else if (path === "system-prompt.md") {
    add("repoDocs", { repo, kind: "system-prompt", doc: { body: text }, updatedAt: now })
  } else if (path === "instructions.md" || path === "cto.md") {
    add("repoDocs", { repo, kind: path.replace(".md", ""), doc: { body: text }, updatedAt: now })
  } else if ((m = path.match(/^context\/([^/]+)\.md$/))) {
    add("repoDocs", { repo, kind: `context:${m[1]}`, doc: { body: text }, updatedAt: now })
  } else if ((m = path.match(/^notifications\/preferences\/([^/]+)\.json$/))) {
    add("notificationPrefs", { repo, login: m[1], prefs: JSON.parse(text), updatedAt: now })
  } else if ((m = path.match(/^user-state\/([^/]+)\/([^/]+)\.json$/))) {
    const doc = JSON.parse(text) as { updatedAt?: string; data?: unknown }
    add("userState", {
      repo,
      namespace: m[1],
      userKey: m[2].replace(/\.json$/, ""),
      data: doc.data ?? doc,
      updatedAt: doc.updatedAt ?? now,
    })
  } else {
    console.warn(`skipped (no mapping): ${path}`)
  }
}

const entries = await listTree()
console.log(`state repo ${stateRepo}@${branch}: ${entries.length} files`)
for (const entry of entries) {
  try {
    await ingest(entry.path)
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

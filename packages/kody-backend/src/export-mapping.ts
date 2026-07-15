// Pure mapping from a GitHub state-repo file to dump table rows — the heart of
// the export script, extracted so it can be unit-tested without GitHub access.

export interface MappedRow {
  table: string
  doc: Record<string, unknown>
}

export function parseJsonl(text: string): unknown[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

// Returns the rows a state-repo file maps to, or null when the path has no
// mapping (caller logs and skips).
export function mapStateFile(
  path: string,
  text: string,
  repo: string,
  now: string,
): MappedRow[] | null {
  let m: RegExpMatchArray | null

  if ((m = path.match(/^workflows\/([^/]+)\/workflow\.json$/))) {
    const definition = JSON.parse(text) as { updatedAt?: string }
    return [
      {
        table: "workflows",
        doc: {
          repo,
          workflowId: m[1],
          definition,
          source: "local",
          updatedAt: definition.updatedAt ?? now,
        },
      },
    ]
  }
  if ((m = path.match(/^workflows\/([^/]+)\/runs\/([^/]+)\.json$/))) {
    return [
      {
        table: "workflowRuns",
        doc: { repo, workflowId: m[1], runId: m[2], state: JSON.parse(text), updatedAt: now },
      },
    ]
  }
  if ((m = path.match(/^sessions\/([^/]+)\.jsonl$/))) {
    const sessionId = m[1]
    const [meta, ...turns] = parseJsonl(text)
    return [
      { table: "chatSessions", doc: { repo, sessionId, meta: meta ?? {}, updatedAt: now } },
      ...turns.map((turn, seq) => ({
        table: "chatTurns",
        doc: { repo, sessionId, seq, turn },
      })),
    ]
  }
  if ((m = path.match(/^events\/([^/]+)\.jsonl$/))) {
    const sessionId = m[1]
    return parseJsonl(text).map((event, seq) => ({
      table: "chatEvents",
      doc: { repo, sessionId, seq, event },
    }))
  }
  if ((m = path.match(/^intents\/([^/]+)\/intent\.json$/))) {
    const intent = JSON.parse(text) as { updatedAt?: string }
    return [
      {
        table: "intents",
        doc: { repo, intentId: m[1], intent, updatedAt: intent.updatedAt ?? now },
      },
    ]
  }
  if ((m = path.match(/^intents\/([^/]+)\/decisions\.jsonl$/))) {
    const intentId = m[1]
    return parseJsonl(text).map((decision, seq) => ({
      table: "intentDecisions",
      doc: { repo, intentId, seq, decision },
    }))
  }
  if ((m = path.match(/^todos\/([^/]+)\.json$/))) {
    return [
      { table: "goals", doc: { repo, goalId: m[1], state: JSON.parse(text), updatedAt: now } },
    ]
  }
  if ((m = path.match(/^reports\/([^/]+)\/runs\/([^/]+)\.md$/))) {
    return [
      {
        table: "reports",
        doc: { repo, slug: m[1], runId: m[2], body: text, meta: {}, updatedAt: now },
      },
    ]
  }
  if ((m = path.match(/^reports\/([^/]+)\.md$/))) {
    return [{ table: "reports", doc: { repo, slug: m[1], body: text, meta: {}, updatedAt: now } }]
  }
  if ((m = path.match(/^agents\/([^/]+)\.md$/))) {
    return [
      {
        table: "agents",
        doc: { repo, slug: m[1], frontmatter: {}, body: text, updatedAt: now },
      },
    ]
  }
  if ((m = path.match(/^views\/renderers\/([^/]+)\.json$/))) {
    return [
      {
        table: "viewRenderers",
        doc: { repo, slug: m[1], definition: JSON.parse(text), updatedAt: now },
      },
    ]
  }
  if (path === "macros.json") {
    const parsed = JSON.parse(text) as { macros?: Array<{ id: string }> }
    return (parsed.macros ?? []).map((macro) => ({
      table: "macros",
      doc: { repo, macroId: macro.id, macro },
    }))
  }
  if (path === "dashboard.json") {
    return [
      {
        table: "repoDocs",
        doc: { repo, kind: "dashboard-config", doc: JSON.parse(text), updatedAt: now },
      },
    ]
  }
  if (path === "system-prompt.md") {
    return [
      { table: "repoDocs", doc: { repo, kind: "system-prompt", doc: { body: text }, updatedAt: now } },
    ]
  }
  if (path === "instructions.md" || path === "cto.md") {
    return [
      {
        table: "repoDocs",
        doc: { repo, kind: path.replace(".md", ""), doc: { body: text }, updatedAt: now },
      },
    ]
  }
  if ((m = path.match(/^context\/([^/]+)\.md$/))) {
    return [
      {
        table: "repoDocs",
        doc: { repo, kind: `context:${m[1]}`, doc: { body: text }, updatedAt: now },
      },
    ]
  }
  if ((m = path.match(/^notifications\/preferences\/([^/]+)\.json$/))) {
    return [
      {
        table: "notificationPrefs",
        doc: { repo, login: m[1], prefs: JSON.parse(text), updatedAt: now },
      },
    ]
  }
  if ((m = path.match(/^user-state\/([^/]+)\/([^/]+)\.json$/))) {
    const doc = JSON.parse(text) as { updatedAt?: string; data?: unknown }
    return [
      {
        table: "userState",
        doc: {
          repo,
          namespace: m[1],
          userKey: m[2],
          data: doc.data ?? doc,
          updatedAt: doc.updatedAt ?? now,
        },
      },
    ]
  }
  return null
}

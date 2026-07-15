// Single source of truth for Kody's data entities.
//
// Every entity registers here exactly once: its Convex table, the state-repo
// paths it is exported from, and its file→rows mapper. Everything else
// derives from this registry — the import table allowlist, the export
// walker's directory list, and the GitHub export mapping. A drift test
// (tests/unit/entity-registry.spec.ts) fails if a schema table is added
// without a registry entry, so there is no second place to update.

export interface MappedRow {
  table: string
  doc: Record<string, unknown>
}

type Mapper = (
  path: string,
  text: string,
  tenantId: string,
  now: string,
) => MappedRow[] | null

export interface EntityDef {
  /** Convex table name (must exist in convex/schema.ts). */
  table: string
  /** Top-level state-repo dirs/files this entity is exported from ([] = not file-sourced: gists, client, or global stores). */
  statePaths: string[]
  /** Maps one state-repo file to rows, or null when the path isn't this entity's. Omitted for non-file-sourced entities. */
  map?: Mapper
}

export function parseJsonl(text: string): unknown[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

export const ENTITIES: EntityDef[] = [
  {
    table: "workflows",
    statePaths: ["workflows"],
    map: (path, text, tenantId, now) => {
      const m = path.match(/^workflows\/([^/]+)\/workflow\.json$/)
      if (!m) return null
      const definition = JSON.parse(text) as { updatedAt?: string }
      return [
        {
          table: "workflows",
          doc: {
            tenantId,
            workflowId: m[1],
            definition,
            source: "local",
            updatedAt: definition.updatedAt ?? now,
          },
        },
      ]
    },
  },
  {
    table: "workflowRuns",
    statePaths: ["workflows"],
    map: (path, text, tenantId, now) => {
      const m = path.match(/^workflows\/([^/]+)\/runs\/([^/]+)\.json$/)
      if (!m) return null
      return [
        {
          table: "workflowRuns",
          doc: { tenantId, workflowId: m[1], runId: m[2], state: JSON.parse(text), updatedAt: now },
        },
      ]
    },
  },
  {
    table: "chatSessions",
    statePaths: ["sessions"],
    map: (path, text, tenantId, now) => {
      const m = path.match(/^sessions\/([^/]+)\.jsonl$/)
      if (!m) return null
      const sessionId = m[1]
      const [meta, ...turns] = parseJsonl(text)
      return [
        { table: "chatSessions", doc: { tenantId, sessionId, meta: meta ?? {}, updatedAt: now } },
        ...turns.map((turn, seq) => ({
          table: "chatTurns",
          doc: { tenantId, sessionId, seq, turn },
        })),
      ]
    },
  },
  { table: "chatTurns", statePaths: ["sessions"] }, // exported by the chatSessions mapper
  {
    table: "chatEvents",
    statePaths: ["events"],
    map: (path, text, tenantId) => {
      const m = path.match(/^events\/([^/]+)\.jsonl$/)
      if (!m) return null
      const sessionId = m[1]
      return parseJsonl(text).map((event, seq) => ({
        table: "chatEvents",
        doc: { tenantId, sessionId, seq, event },
      }))
    },
  },
  {
    table: "intents",
    statePaths: ["intents"],
    map: (path, text, tenantId, now) => {
      const m = path.match(/^intents\/([^/]+)\/intent\.json$/)
      if (!m) return null
      const intent = JSON.parse(text) as { updatedAt?: string }
      return [
        {
          table: "intents",
          doc: { tenantId, intentId: m[1], intent, updatedAt: intent.updatedAt ?? now },
        },
      ]
    },
  },
  {
    table: "intentDecisions",
    statePaths: ["intents"],
    map: (path, text, tenantId) => {
      const m = path.match(/^intents\/([^/]+)\/decisions\.jsonl$/)
      if (!m) return null
      const intentId = m[1]
      return parseJsonl(text).map((decision, seq) => ({
        table: "intentDecisions",
        doc: { tenantId, intentId, seq, decision },
      }))
    },
  },
  {
    table: "goals",
    statePaths: ["todos"],
    map: (path, text, tenantId, now) => {
      const m = path.match(/^todos\/([^/]+)\.json$/)
      if (!m) return null
      return [
        { table: "goals", doc: { tenantId, goalId: m[1], state: JSON.parse(text), updatedAt: now } },
      ]
    },
  },
  {
    table: "reports",
    statePaths: ["reports"],
    map: (path, text, tenantId, now) => {
      let m = path.match(/^reports\/([^/]+)\/runs\/([^/]+)\.md$/)
      if (m) {
        return [
          {
            table: "reports",
            doc: { tenantId, slug: m[1], runId: m[2], body: text, meta: {}, updatedAt: now },
          },
        ]
      }
      m = path.match(/^reports\/([^/]+)\.md$/)
      if (!m) return null
      return [
        { table: "reports", doc: { tenantId, slug: m[1], body: text, meta: {}, updatedAt: now } },
      ]
    },
  },
  {
    table: "agents",
    statePaths: ["agents"],
    map: (path, text, tenantId, now) => {
      const m = path.match(/^agents\/([^/]+)\.md$/)
      if (!m) return null
      return [
        {
          table: "agents",
          doc: { tenantId, slug: m[1], frontmatter: {}, body: text, updatedAt: now },
        },
      ]
    },
  },
  {
    table: "viewRenderers",
    statePaths: ["views"],
    map: (path, text, tenantId, now) => {
      const m = path.match(/^views\/renderers\/([^/]+)\.json$/)
      if (!m) return null
      return [
        {
          table: "viewRenderers",
          doc: { tenantId, slug: m[1], definition: JSON.parse(text), updatedAt: now },
        },
      ]
    },
  },
  {
    table: "macros",
    statePaths: ["macros.json"],
    map: (path, text, tenantId) => {
      if (path !== "macros.json") return null
      const parsed = JSON.parse(text) as { macros?: Array<{ id: string }> }
      return (parsed.macros ?? []).map((macro) => ({
        table: "macros",
        doc: { tenantId, macroId: macro.id, macro },
      }))
    },
  },
  {
    table: "repoDocs",
    statePaths: [
      "dashboard.json",
      "system-prompt.md",
      "instructions.md",
      "cto.md",
      "context",
      "portfolio.json",
      "agency-portfolio.json",
      "variables.json",
      "runs",
      "terminal",
      "operations",
      "chat",
    ],
    map: (path, text, tenantId, now) => {
      if (path === "dashboard.json") {
        return [
          {
            table: "repoDocs",
            doc: { tenantId, kind: "dashboard-config", doc: JSON.parse(text), updatedAt: now },
          },
        ]
      }
      if (path === "system-prompt.md") {
        return [
          {
            table: "repoDocs",
            doc: { tenantId, kind: "system-prompt", doc: { body: text }, updatedAt: now },
          },
        ]
      }
      if (path === "instructions.md" || path === "cto.md") {
        return [
          {
            table: "repoDocs",
            doc: { tenantId, kind: path.replace(".md", ""), doc: { body: text }, updatedAt: now },
          },
        ]
      }
      let m = path.match(/^context\/([^/]+)\.md$/)
      if (m) {
        return [
          {
            table: "repoDocs",
            doc: { tenantId, kind: `context:${m[1]}`, doc: { body: text }, updatedAt: now },
          },
        ]
      }
      if (
        path === "portfolio.json" ||
        path === "agency-portfolio.json" ||
        path === "variables.json" ||
        path === "runs/index.json"
      ) {
        const kind = path === "runs/index.json" ? "runs-index" : path.replace(".json", "")
        return [
          { table: "repoDocs", doc: { tenantId, kind, doc: JSON.parse(text), updatedAt: now } },
        ]
      }
      m = path.match(/^operations\/([^/]+)\/operation\.json$/)
      if (m) {
        return [
          {
            table: "repoDocs",
            doc: { tenantId, kind: `operation:${m[1]}`, doc: JSON.parse(text), updatedAt: now },
          },
        ]
      }
      if (path === "chat/global.json" || path === "chat/last-written.json") {
        const kind = path === "chat/global.json" ? "chat-global" : "chat-global-gate"
        return [
          { table: "repoDocs", doc: { tenantId, kind, doc: JSON.parse(text), updatedAt: now } },
        ]
      }
      m = path.match(/^terminal\/checkpoints\/([^/]+)\.json$/)
      if (m) {
        return [
          {
            table: "repoDocs",
            doc: {
              tenantId,
              kind: `terminal-checkpoint:${m[1]}`,
              doc: JSON.parse(text),
              updatedAt: now,
            },
          },
        ]
      }
      return null
    },
  },
  {
    table: "notificationPrefs",
    statePaths: ["notifications"],
    map: (path, text, tenantId, now) => {
      const m = path.match(/^notifications\/preferences\/([^/]+)\.json$/)
      if (!m) return null
      return [
        {
          table: "notificationPrefs",
          doc: { tenantId, login: m[1], prefs: JSON.parse(text), updatedAt: now },
        },
      ]
    },
  },
  {
    table: "userState",
    statePaths: ["user-state"],
    map: (path, text, tenantId, now) => {
      const m = path.match(/^user-state\/([^/]+)\/([^/]+)\.json$/)
      if (!m) return null
      const doc = JSON.parse(text) as { updatedAt?: string; data?: unknown }
      return [
        {
          table: "userState",
          doc: {
            tenantId,
            namespace: m[1],
            userKey: m[2],
            data: doc.data ?? doc,
            updatedAt: doc.updatedAt ?? now,
          },
        },
      ]
    },
  },
  {
    table: "agencyRecords",
    statePaths: ["agency"],
    map: (path, text, tenantId, now) => {
      const m = path.match(/^agency\/(observations|findings|learnings)\/([^/]+)\.json$/)
      if (!m) return null
      const kind = m[1].replace(/s$/, "")
      return [
        {
          table: "agencyRecords",
          doc: { tenantId, kind, recordId: m[2], doc: JSON.parse(text), updatedAt: now },
        },
      ]
    },
  },
  {
    table: "taskState",
    statePaths: ["tasks"],
    map: (path, text, tenantId, now) => {
      const m = path.match(/^tasks\/((?:issues\/|prs\/)?[^/]+)\/([^/]+)\.json$/)
      if (!m) return null
      // Some agents write plain text into task .json files — keep it as body.
      let doc: unknown
      try {
        doc = JSON.parse(text)
      } catch {
        doc = { body: text }
      }
      return [
        {
          table: "taskState",
          doc: { tenantId, taskKey: m[1], kind: m[2], doc, updatedAt: now },
        },
      ]
    },
  },
  {
    table: "capabilityState",
    statePaths: ["capabilities"],
    map: (path, text, tenantId, now) => {
      const m = path.match(/^capabilities\/([^/]+)\/state\.json$/)
      if (!m) return null
      return [
        {
          table: "capabilityState",
          doc: { tenantId, slug: m[1], state: JSON.parse(text), updatedAt: now },
        },
      ]
    },
  },
  {
    table: "dailyLogs",
    statePaths: ["activity", "events"],
    map: (path, text, tenantId) => {
      let m = path.match(/^activity\/(\d{4}-\d{2}-\d{2})\.jsonl$/)
      if (m) {
        const date = m[1]
        return parseJsonl(text).map((entry, seq) => ({
          table: "dailyLogs",
          doc: { tenantId, stream: "activity", date, seq, entry },
        }))
      }
      m = path.match(/^events\/log\/(\d{4}-\d{2}-\d{2})\.jsonl$/)
      if (!m) return null
      const date = m[1]
      return parseJsonl(text).map((entry, seq) => ({
        table: "dailyLogs",
        doc: { tenantId, stream: "events", date, seq, entry },
      }))
    },
  },
  // Not file-sourced: gist-backed, client-side, or global engine stores.
  { table: "inboxEntries", statePaths: [] },
  { table: "channelsSeen", statePaths: [] },
  { table: "actionStates", statePaths: [] },
  { table: "eventLog", statePaths: [] },
]

/** Every table an import may write to — derived, never hand-listed. */
export const IMPORTABLE_TABLES: readonly string[] = [
  ...new Set(ENTITIES.map((e) => e.table)),
]

/** Top-level state-repo dirs/files the export walker must visit — derived. */
export const STATE_ROOTS: readonly string[] = [
  ...new Set(ENTITIES.flatMap((e) => e.statePaths)),
]

// dailyLogs claims "events/log/…" while chatEvents claims "events/<session>" —
// mappers are tried in registry order and the first non-null wins, but these
// two are disjoint by pattern. The registry is ordered so aggregate mappers
// (chatSessions → chatTurns) come before their derived tables.
export function mapStateFile(
  path: string,
  text: string,
  tenantId: string,
  now: string,
): MappedRow[] | null {
  for (const entity of ENTITIES) {
    if (!entity.map) continue
    const rows = entity.map(path, text, tenantId, now)
    if (rows) return rows
  }
  return null
}

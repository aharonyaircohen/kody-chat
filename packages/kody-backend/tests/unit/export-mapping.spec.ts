import { describe, expect, it } from "vitest"
import { mapStateFile, parseJsonl } from "../../src/export-mapping.ts"

const REPO = "acme/app"
const NOW = "2026-07-15T00:00:00.000Z"

describe("parseJsonl", () => {
  it("parses one object per non-empty line", () => {
    expect(parseJsonl('{"a":1}\n\n{"b":2}\n')).toEqual([{ a: 1 }, { b: 2 }])
  })

  it("returns empty array for empty input", () => {
    expect(parseJsonl("")).toEqual([])
    expect(parseJsonl("\n\n")).toEqual([])
  })

  it("throws on malformed lines", () => {
    expect(() => parseJsonl("not json")).toThrow()
  })
})

describe("mapStateFile", () => {
  it("maps workflow definitions and preserves their updatedAt", () => {
    const rows = mapStateFile(
      "workflows/deploy/workflow.json",
      JSON.stringify({ version: 1, name: "Deploy", updatedAt: "2026-01-01T00:00:00Z" }),
      REPO,
      NOW,
    )
    expect(rows).toEqual([
      {
        table: "workflows",
        doc: {
          tenantId: REPO,
          workflowId: "deploy",
          definition: { version: 1, name: "Deploy", updatedAt: "2026-01-01T00:00:00Z" },
          source: "local",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      },
    ])
  })

  it("falls back to now when a workflow has no updatedAt", () => {
    const rows = mapStateFile("workflows/x/workflow.json", "{}", REPO, NOW)
    expect(rows?.[0].doc.updatedAt).toBe(NOW)
  })

  it("maps workflow runs", () => {
    const rows = mapStateFile(
      "workflows/deploy/runs/r1.json",
      JSON.stringify({ status: "done" }),
      REPO,
      NOW,
    )
    expect(rows?.[0]).toMatchObject({
      table: "workflowRuns",
      doc: { workflowId: "deploy", runId: "r1", state: { status: "done" } },
    })
  })

  it("splits a session jsonl into meta + sequenced turns", () => {
    const text = [
      JSON.stringify({ type: "meta", mode: "interactive" }),
      JSON.stringify({ role: "user", content: "hi" }),
      JSON.stringify({ role: "assistant", content: "hello" }),
    ].join("\n")
    const rows = mapStateFile("sessions/s1.jsonl", text, REPO, NOW)
    expect(rows).toHaveLength(3)
    expect(rows?.[0]).toMatchObject({
      table: "chatSessions",
      doc: { sessionId: "s1", meta: { type: "meta", mode: "interactive" } },
    })
    expect(rows?.[1]).toMatchObject({ table: "chatTurns", doc: { seq: 0 } })
    expect(rows?.[2]).toMatchObject({ table: "chatTurns", doc: { seq: 1 } })
  })

  it("handles an empty session file with a default meta", () => {
    const rows = mapStateFile("sessions/s2.jsonl", "", REPO, NOW)
    expect(rows).toEqual([
      { table: "chatSessions", doc: { tenantId: REPO, sessionId: "s2", meta: {}, updatedAt: NOW } },
    ])
  })

  it("maps event streams with sequence numbers", () => {
    const text = ['{"e":1}', '{"e":2}'].join("\n")
    const rows = mapStateFile("events/s1.jsonl", text, REPO, NOW)
    expect(rows).toEqual([
      { table: "chatEvents", doc: { tenantId: REPO, sessionId: "s1", seq: 0, event: { e: 1 } } },
      { table: "chatEvents", doc: { tenantId: REPO, sessionId: "s1", seq: 1, event: { e: 2 } } },
    ])
  })

  it("maps intents and decision logs", () => {
    expect(
      mapStateFile("intents/i1/intent.json", '{"status":"active"}', REPO, NOW)?.[0],
    ).toMatchObject({ table: "intents", doc: { intentId: "i1" } })
    const decisions = mapStateFile("intents/i1/decisions.jsonl", '{"d":1}\n{"d":2}', REPO, NOW)
    expect(decisions?.map((r) => r.table)).toEqual(["intentDecisions", "intentDecisions"])
    expect(decisions?.[1].doc.seq).toBe(1)
  })

  it("maps goals, reports (top-level and runs), agents, renderers", () => {
    expect(mapStateFile("todos/g1.json", "{}", REPO, NOW)?.[0].table).toBe("goals")
    expect(mapStateFile("reports/weekly.md", "# hi", REPO, NOW)?.[0]).toMatchObject({
      table: "reports",
      doc: { slug: "weekly", body: "# hi" },
    })
    expect(mapStateFile("reports/weekly/runs/run1.md", "body", REPO, NOW)?.[0]).toMatchObject({
      table: "reports",
      doc: { slug: "weekly", runId: "run1" },
    })
    expect(mapStateFile("agents/helper.md", "# agent", REPO, NOW)?.[0]).toMatchObject({
      table: "agents",
      doc: { slug: "helper", body: "# agent" },
    })
    expect(mapStateFile("views/renderers/card.json", "{}", REPO, NOW)?.[0].table).toBe(
      "viewRenderers",
    )
  })

  it("explodes macros.json into one row per macro", () => {
    const text = JSON.stringify({ version: 1, macros: [{ id: "m1" }, { id: "m2" }] })
    const rows = mapStateFile("macros.json", text, REPO, NOW)
    expect(rows?.map((r) => r.doc.macroId)).toEqual(["m1", "m2"])
  })

  it("maps singleton docs to repoDocs kinds", () => {
    expect(mapStateFile("dashboard.json", "{}", REPO, NOW)?.[0].doc.kind).toBe("dashboard-config")
    expect(mapStateFile("system-prompt.md", "p", REPO, NOW)?.[0].doc.kind).toBe("system-prompt")
    expect(mapStateFile("instructions.md", "i", REPO, NOW)?.[0].doc.kind).toBe("instructions")
    expect(mapStateFile("cto.md", "c", REPO, NOW)?.[0].doc.kind).toBe("cto")
    expect(mapStateFile("context/team.md", "t", REPO, NOW)?.[0].doc.kind).toBe("context:team")
  })

  it("maps notification prefs and user-state", () => {
    expect(
      mapStateFile("notifications/preferences/octocat.json", "{}", REPO, NOW)?.[0],
    ).toMatchObject({ table: "notificationPrefs", doc: { login: "octocat" } })
    const rows = mapStateFile(
      "user-state/profile/user1.json",
      JSON.stringify({ version: 1, data: { name: "A" }, updatedAt: "2026-02-02T00:00:00Z" }),
      REPO,
      NOW,
    )
    expect(rows?.[0]).toMatchObject({
      table: "userState",
      doc: {
        namespace: "profile",
        userKey: "user1",
        data: { name: "A" },
        updatedAt: "2026-02-02T00:00:00Z",
      },
    })
  })

  it("keeps the whole doc as data when user-state has no data field", () => {
    const rows = mapStateFile("user-state/stats/u2.json", '{"count":3}', REPO, NOW)
    expect(rows?.[0].doc.data).toEqual({ count: 3 })
  })

  it("returns null for unmapped paths", () => {
    expect(mapStateFile("random/unknown.txt", "x", REPO, NOW)).toBeNull()
    expect(mapStateFile("README.md", "x", REPO, NOW)).toBeNull()
  })
})

describe("mapStateFile — extended state kinds", () => {
  it("maps agency observations, findings, learnings", () => {
    expect(mapStateFile("agency/observations/obs-1.json", "{}", REPO, NOW)?.[0]).toMatchObject({
      table: "agencyRecords",
      doc: { kind: "observation", recordId: "obs-1" },
    })
    expect(mapStateFile("agency/findings/f1.json", "{}", REPO, NOW)?.[0].doc.kind).toBe("finding")
    expect(mapStateFile("agency/learnings/l1.json", "{}", REPO, NOW)?.[0].doc.kind).toBe("learning")
  })

  it("maps task state including issues/prs subkeys", () => {
    expect(mapStateFile("tasks/2/context.json", "{}", REPO, NOW)?.[0]).toMatchObject({
      table: "taskState",
      doc: { taskKey: "2", kind: "context" },
    })
    expect(mapStateFile("tasks/issues/2/state.json", "{}", REPO, NOW)?.[0].doc.taskKey).toBe(
      "issues/2",
    )
    expect(mapStateFile("tasks/prs/3/state.json", "{}", REPO, NOW)?.[0].doc.taskKey).toBe("prs/3")
  })

  it("maps capability state", () => {
    expect(mapStateFile("capabilities/dev-ci/state.json", "{}", REPO, NOW)?.[0]).toMatchObject({
      table: "capabilityState",
      doc: { slug: "dev-ci" },
    })
  })

  it("maps daily activity and event logs line by line", () => {
    const rows = mapStateFile("activity/2026-07-12.jsonl", '{"a":1}\n{"a":2}', REPO, NOW)
    expect(rows).toHaveLength(2)
    expect(rows?.[1].doc).toMatchObject({ stream: "activity", date: "2026-07-12", seq: 1 })
    expect(mapStateFile("events/log/2026-07-13.jsonl", '{"e":1}', REPO, NOW)?.[0].doc.stream).toBe(
      "events",
    )
  })

  it("keeps per-session event streams separate from daily event logs", () => {
    expect(mapStateFile("events/s1.jsonl", '{"e":1}', REPO, NOW)?.[0].table).toBe("chatEvents")
  })

  it("maps singleton files to repoDocs kinds", () => {
    expect(mapStateFile("portfolio.json", "{}", REPO, NOW)?.[0].doc.kind).toBe("portfolio")
    expect(mapStateFile("agency-portfolio.json", "{}", REPO, NOW)?.[0].doc.kind).toBe(
      "agency-portfolio",
    )
    expect(mapStateFile("variables.json", "{}", REPO, NOW)?.[0].doc.kind).toBe("variables")
    expect(mapStateFile("runs/index.json", "{}", REPO, NOW)?.[0].doc.kind).toBe("runs-index")
    expect(mapStateFile("terminal/checkpoints/octocat.json", "{}", REPO, NOW)?.[0].doc.kind).toBe(
      "terminal-checkpoint:octocat",
    )
  })

  it("maps operations to per-operation repoDocs kinds", () => {
    const rows = mapStateFile(
      "operations/release/operation.json",
      JSON.stringify({ id: "release" }),
      REPO,
      NOW,
    )
    expect(rows?.[0]).toMatchObject({
      table: "repoDocs",
      doc: { tenantId: REPO, kind: "operation:release", doc: { id: "release" } },
    })
    expect(mapStateFile("operations/release/notes.md", "x", REPO, NOW)).toBeNull()
  })

  it("maps client brands and disabled markers to repoDocs kinds", () => {
    const rows = mapStateFile(
      "brands/acme.json",
      JSON.stringify({ slug: "acme", name: "Acme", accent: "#2563eb" }),
      REPO,
      NOW,
    )
    expect(rows?.[0]).toMatchObject({
      table: "repoDocs",
      doc: { tenantId: REPO, kind: "brand:acme", doc: { slug: "acme" } },
    })
    // Disabled markers are plain text, not JSON.
    expect(mapStateFile("brands/acme.disabled", "acme\n", REPO, NOW)?.[0].doc).toMatchObject({
      kind: "brand-disabled:acme",
      doc: { slug: "acme" },
    })
    expect(mapStateFile("brands/README.md", "x", REPO, NOW)).toBeNull()
  })

  it("maps the global chat snapshot and its write gate", () => {
    expect(mapStateFile("chat/global.json", "{}", REPO, NOW)?.[0].doc.kind).toBe("chat-global")
    expect(mapStateFile("chat/last-written.json", "{}", REPO, NOW)?.[0].doc.kind).toBe(
      "chat-global-gate",
    )
    expect(mapStateFile("chat/other.json", "{}", REPO, NOW)).toBeNull()
  })

  it("still skips secrets and goal run logs deliberately", () => {
    expect(mapStateFile("secrets.enc", "x", REPO, NOW)).toBeNull()
    expect(mapStateFile("logs/goals/g1/runs/r1.jsonl", "{}", REPO, NOW)).toBeNull()
  })
})

describe("mapStateFile — malformed task files", () => {
  it("wraps non-JSON task file content as a body doc instead of failing", () => {
    const rows = mapStateFile("tasks/1095/task.json", "Fixed the bug. Summary:", REPO, NOW)
    expect(rows?.[0].doc.doc).toEqual({ body: "Fixed the bug. Summary:" })
  })
})

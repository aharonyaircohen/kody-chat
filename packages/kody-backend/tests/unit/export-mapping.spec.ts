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
          repo: REPO,
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
      { table: "chatSessions", doc: { repo: REPO, sessionId: "s2", meta: {}, updatedAt: NOW } },
    ])
  })

  it("maps event streams with sequence numbers", () => {
    const text = ['{"e":1}', '{"e":2}'].join("\n")
    const rows = mapStateFile("events/s1.jsonl", text, REPO, NOW)
    expect(rows).toEqual([
      { table: "chatEvents", doc: { repo: REPO, sessionId: "s1", seq: 0, event: { e: 1 } } },
      { table: "chatEvents", doc: { repo: REPO, sessionId: "s1", seq: 1, event: { e: 2 } } },
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

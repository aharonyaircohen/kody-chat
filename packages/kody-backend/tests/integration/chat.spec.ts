import { describe, expect, it } from "vitest"
import { api } from "../../convex/_generated/api"
import { setup } from "./helpers"

const REPO = "acme/app"
const NOW = "2026-07-15T00:00:00.000Z"

describe("chat", () => {
  it("upserts sessions and lists them per repo", async () => {
    const t = setup()
    await t.mutation(api.chat.upsertSession, {
      repo: REPO,
      sessionId: "s1",
      meta: { title: "First" },
      updatedAt: NOW,
    })
    await t.mutation(api.chat.upsertSession, {
      repo: REPO,
      sessionId: "s1",
      meta: { title: "Renamed" },
      updatedAt: NOW,
    })

    const sessions = await t.query(api.chat.listSessions, { repo: REPO })
    expect(sessions).toHaveLength(1)
    expect(sessions[0].meta.title).toBe("Renamed")
  })

  it("appends turns with increasing seq and returns them with the session", async () => {
    const t = setup()
    await t.mutation(api.chat.upsertSession, {
      repo: REPO,
      sessionId: "s1",
      meta: {},
      updatedAt: NOW,
    })
    await t.mutation(api.chat.appendTurn, {
      repo: REPO,
      sessionId: "s1",
      turn: { role: "user", content: "hi" },
    })
    await t.mutation(api.chat.appendTurn, {
      repo: REPO,
      sessionId: "s1",
      turn: { role: "assistant", content: "hello" },
    })

    const result = await t.query(api.chat.getSession, { repo: REPO, sessionId: "s1" })
    expect(result?.turns.map((x) => x.seq)).toEqual([0, 1])
    expect(result?.turns[1].turn.content).toBe("hello")
  })

  it("returns null for a missing session", async () => {
    const t = setup()
    expect(await t.query(api.chat.getSession, { repo: REPO, sessionId: "nope" })).toBeNull()
  })

  it("streams events after a given seq", async () => {
    const t = setup()
    for (const n of [1, 2, 3]) {
      await t.mutation(api.chat.appendEvent, {
        repo: REPO,
        sessionId: "s1",
        event: { n },
      })
    }
    const tail = await t.query(api.chat.eventsSince, {
      repo: REPO,
      sessionId: "s1",
      afterSeq: 0,
    })
    expect(tail.map((e) => e.event.n)).toEqual([2, 3])
  })

  it("keeps event seqs independent per session", async () => {
    const t = setup()
    await t.mutation(api.chat.appendEvent, { repo: REPO, sessionId: "a", event: {} })
    await t.mutation(api.chat.appendEvent, { repo: REPO, sessionId: "b", event: {} })
    const a = await t.query(api.chat.eventsSince, { repo: REPO, sessionId: "a", afterSeq: -1 })
    expect(a).toHaveLength(1)
    expect(a[0].seq).toBe(0)
  })
})

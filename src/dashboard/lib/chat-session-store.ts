/**
 * @fileType util
 * @domain kody
 * @pattern in-process-session-store
 *
 * In-memory chat session state keyed by sessionId. Holds the conversation
 * transcript and wakes waiters (long-poll on /pull) when a new user turn
 * lands. This replaces the prior `.kody/sessions/<id>.jsonl` git commit
 * flow — chat is ephemeral now; transcripts live only in memory for the
 * session's lifetime.
 *
 * LIMITATION: module-scoped state doesn't cross Vercel serverless instances.
 * A user message POSTed to instance A may not be visible to a runner pulling
 * from instance B. Acceptable for prototype; upgrade to KV/Redis when traffic
 * warrants cross-instance fan-out.
 */

export interface ChatTurn {
  role: "user" | "assistant"
  content: string
  timestamp: string
}

interface SessionState {
  turns: ChatTurn[]
  waiters: Array<() => void>
  /** Epoch ms when the dashboard last dispatched a workflow for this session. */
  lastDispatchedAt: number
}

const sessions = new Map<string, SessionState>()

function getOrInit(sessionId: string): SessionState {
  let state = sessions.get(sessionId)
  if (!state) {
    state = { turns: [], waiters: [], lastDispatchedAt: 0 }
    sessions.set(sessionId, state)
  }
  return state
}

export function markDispatched(sessionId: string): void {
  const state = getOrInit(sessionId)
  state.lastDispatchedAt = Date.now()
}

/**
 * Returns true if the session has no active runner (never dispatched, or
 * dispatched more than `freshnessMs` ago). The runner's idle timeout should
 * match this window — default to 3 min on both sides.
 */
export function needsDispatch(sessionId: string, freshnessMs: number): boolean {
  const state = sessions.get(sessionId)
  if (!state) return true
  return Date.now() - state.lastDispatchedAt > freshnessMs
}

export function appendUserTurn(sessionId: string, content: string): ChatTurn {
  const turn: ChatTurn = {
    role: "user",
    content,
    timestamp: new Date().toISOString(),
  }
  const state = getOrInit(sessionId)
  state.turns.push(turn)
  // Wake every waiter and reset the list — the long-poll handler handles
  // debouncing if more turns arrive before it re-subscribes.
  const waiters = state.waiters
  state.waiters = []
  for (const w of waiters) {
    try { w() } catch { /* swallow */ }
  }
  return turn
}

export function appendAssistantTurn(sessionId: string, content: string, timestamp?: string): ChatTurn {
  const turn: ChatTurn = {
    role: "assistant",
    content,
    timestamp: timestamp ?? new Date().toISOString(),
  }
  const state = getOrInit(sessionId)
  state.turns.push(turn)
  return turn
}

/** Read turns from an index onward. Callers pass `since` = last seen index. */
export function getTurnsSince(sessionId: string, since: number): ChatTurn[] {
  const state = sessions.get(sessionId)
  if (!state) return []
  return state.turns.slice(Math.max(0, since))
}

export function getAllTurns(sessionId: string): ChatTurn[] {
  const state = sessions.get(sessionId)
  if (!state) return []
  return state.turns.slice()
}

export function turnCount(sessionId: string): number {
  const state = sessions.get(sessionId)
  return state ? state.turns.length : 0
}

/**
 * Long-poll helper: resolves when a new turn arrives or the timeout expires.
 * Returns true if a new turn landed, false on timeout.
 */
export function waitForNewTurn(sessionId: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const state = getOrInit(sessionId)
    let settled = false

    const wake = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(true)
    }

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      const idx = state.waiters.indexOf(wake)
      if (idx >= 0) state.waiters.splice(idx, 1)
      resolve(false)
    }, timeoutMs)

    state.waiters.push(wake)
  })
}

export function dropSession(sessionId: string): void {
  sessions.delete(sessionId)
}

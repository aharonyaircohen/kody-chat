/**
 * @fileType util
 * @domain kody
 * @pattern legacy-session-write
 *
 * Feature flag for the legacy chat-session dual-write.
 *
 * Chat transcripts are written to TWO places today:
 *   1. Convex (chatSessions/chatTurns) — the durable record the dashboard
 *      and the modern engine read.
 *   2. The Kody state repo on GitHub at `sessions/<id>.jsonl` — the legacy
 *      path, kept only because older engine runners git-pull that file for
 *      their inbox/history loop.
 *
 * This flag gates ONLY the legacy GitHub write (#2). The Convex write is
 * unconditional. Default is ON; set `KODY_LEGACY_SESSION_WRITE=0` to turn
 * the legacy write off without a deploy. That is safe once every engine
 * repo runs `@kody-ade/kody-engine` >= 0.4.381 (the version that reads the
 * transcript from Convex via its CONVEX_URL / KODY_SERVICE_KEY Actions
 * secrets — see kody2 src/chat/session-store.ts and
 * docs/storage-backend.md).
 */
export function isLegacySessionWriteEnabled(): boolean {
  return process.env.KODY_LEGACY_SESSION_WRITE !== "0";
}

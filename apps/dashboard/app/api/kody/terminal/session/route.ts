/** Brain owns terminal identity; Fly owns the authorized machine connection. */
export { POST } from "@kody-ade/brain/routes/terminal-session";

// Next.js segment config must be declared literally in the app route file —
// re-exported consts are ignored by Next.js static analysis. Mirrors @kody-ade/terminal/routes/terminal-session.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

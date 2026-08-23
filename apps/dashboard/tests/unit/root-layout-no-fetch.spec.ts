/**
 * Regression test for the E2E gate failure (CI run 32629412166 / PR #24,
 * headSha 08adfa3c5c705b0ec1dbc26c0c2e6fb958239ad1): the root dashboard
 * layout used to be `async` and called `getKodyAuthToken()` at SSR. In
 * the PW_LOCAL E2E harness the upstream Convex backend isn't reachable,
 * so the `await` triggered a `TypeError: fetch failed` that crashed the
 * dev server before any test could run. The fix made `KodyLayout`
 * synchronous and removed the server-side token fetch — auth/identity
 * now lives in client-mounted providers (`KodyProviders` →
 * `ConvexClientProvider` + `AuthProvider`).
 *
 * This test asserts the structural markers so a future refactor can't
 * silently re-introduce a fetch in the root layout.
 *
 * @testFramework vitest
 * @domain unit
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const LAYOUT_PATH = resolve(__dirname, "../../app/layout.tsx");
const LAYOUT_SOURCE = readFileSync(LAYOUT_PATH, "utf8");

describe("root dashboard layout (e2e gate regression)", () => {
  it("does not export an async layout", () => {
    expect(LAYOUT_SOURCE).not.toMatch(
      /export\s+default\s+async\s+function\s+KodyLayout/,
    );
  });

  it("does not await getKodyAuthToken in the root layout", () => {
    expect(LAYOUT_SOURCE).not.toMatch(/await\s+getKodyAuthToken/);
  });

  it("does not import getKodyAuthToken in the root layout", () => {
    expect(LAYOUT_SOURCE).not.toMatch(
      /import\s+\{[^}]*\bgetKodyAuthToken\b[^}]*\}\s+from/,
    );
  });

  it("does not pass initialAuthToken into KodyProviders", () => {
    expect(LAYOUT_SOURCE).not.toMatch(/<KodyProviders\s+initialAuthToken=/);
  });

  it("does not leave any top-level await in the layout body", () => {
    // The original regression was an `await getKodyAuthToken()` inside the
    // KodyLayout body. Guard against any future top-level await — the layout
    // must stay fully synchronous for prerendering to work. Use a word-boundary
    // match so `await(`, `await\n`, or `await;` patterns all trip the guard.
    expect(LAYOUT_SOURCE).not.toMatch(/\bawait\b/);
  });

  it("does not call fetch() at module scope inside the layout body", () => {
    // Belt-and-braces: even a non-awaited `fetch(...)` at the top level of
    // `KodyLayout` would run during prerender and fail CI with the same
    // `TypeError: fetch failed` signature. Block the bare call directly.
    const bodyMatch = LAYOUT_SOURCE.match(
      /export\s+default\s+function\s+KodyLayout\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/,
    );
    const body = bodyMatch ? bodyMatch[1] : "";
    expect(body).not.toMatch(/\bfetch\s*\(/);
  });

  it("does not import next/headers in the root layout", () => {
    // The same prerender crash class as `getKodyAuthToken` — anything that
    // forces the layout to depend on a request-time resource blocks the
    // build when the upstream endpoint is unreachable. Block the import
    // outright so a future "just read the auth cookie" refactor can't
    // silently re-couple identity into the root layout.
    expect(LAYOUT_SOURCE).not.toMatch(/from\s+["']next\/headers["']/);
  });

  it("does not construct a Promise at the top of the layout body", () => {
    // Belt-and-braces: an unawaited `new Promise(...)` or `Promise.all([...])`
    // at the top of `KodyLayout` would still be evaluated during prerender
    // and could throw the same `TypeError: fetch failed` signature if the
    // executor calls a network-bound function. Block the constructor patterns
    // so the layout stays free of any request-time work.
    const bodyMatch = LAYOUT_SOURCE.match(
      /export\s+default\s+function\s+KodyLayout\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/,
    );
    const body = bodyMatch ? bodyMatch[1] : "";
    expect(body).not.toMatch(/\bnew\s+Promise\s*\(/);
    expect(body).not.toMatch(/\bPromise\.(all|race|allSettled|any)\s*\(/);
  });
});

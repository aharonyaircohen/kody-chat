/**
 * Regression test for the E2E gate failure (CI run 32251372234 / PR #24):
 * the root dashboard layout used to be `async` and called
 * `getKodyAuthToken()` at SSR. In the PW_LOCAL E2E harness the upstream
 * Convex backend isn't reachable, so the `await` triggered a
 * `TypeError: fetch failed` that crashed the dev server before any test
 * could run. The fix made `KodyLayout` synchronous and removed the
 * server-side token fetch — auth/identity now lives in client-mounted
 * providers (`KodyProviders` → `ConvexClientProvider` + `AuthProvider`).
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
});

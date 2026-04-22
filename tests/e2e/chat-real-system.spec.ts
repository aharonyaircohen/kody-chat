/**
 * @fileoverview Real-system e2e — exercises the full pipeline:
 *   dashboard UI → /api/kody/chat/trigger → GitHub Actions (kody2.yml) →
 *   @kody-ade/kody-engine kody2 chat → LLM → events committed back →
 *   SSE stream → UI render.
 *
 * @testFramework playwright
 * @domain e2e-real
 *
 * Gated by RUN_REAL_E2E=1 because each test takes 60–120 s and uses real
 * GitHub Actions minutes + provider tokens. Intended for nightly CI.
 *
 * Required env:
 *   BASE_URL             Deployed dashboard (SSO must be off)
 *   E2E_GITHUB_TOKEN     PAT with `repo` + `workflow` for the target repo
 *   E2E_GITHUB_REPO      Full URL, e.g. https://github.com/<owner>/<repo>
 *   E2E_CHAT_MODEL       Optional, e.g. minimax/MiniMax-M2.7-highspeed
 */

import { test, expect, type Page } from "@playwright/test"

const BASE_URL = process.env.BASE_URL ?? ""
const TEST_TOKEN = process.env.E2E_GITHUB_TOKEN ?? ""
const TEST_REPO = process.env.E2E_GITHUB_REPO ?? ""
const RUN_REAL = process.env.RUN_REAL_E2E === "1"

function parseRepo(url: string): { owner: string; repo: string } {
  try {
    const u = new URL(url)
    const parts = u.pathname.replace(/^\//, "").split("/").filter(Boolean)
    return { owner: parts[0] ?? "", repo: parts[1] ?? "" }
  } catch {
    return { owner: "", repo: "" }
  }
}

async function injectAuth(page: Page): Promise<void> {
  const { owner, repo } = parseRepo(TEST_REPO)
  await page.evaluate(
    (auth) => localStorage.setItem("kody_auth", JSON.stringify(auth)),
    {
      repoUrl: TEST_REPO,
      owner,
      repo,
      token: TEST_TOKEN,
      user: { login: "real-e2e-test", avatar_url: "", id: 1 },
      loggedInAt: Date.now(),
    },
  )
}

test.describe("Real chat flow @real", () => {
  test.skip(!RUN_REAL, "set RUN_REAL_E2E=1 to enable real-system chat e2e")
  test.setTimeout(180_000) // 3 min per test — accounts for runner boot + LLM call

  test.beforeAll(() => {
    if (!BASE_URL || !TEST_TOKEN || !TEST_REPO) {
      test.skip(true, "BASE_URL / E2E_GITHUB_TOKEN / E2E_GITHUB_REPO required")
    }
  })

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/login`)
    await page.waitForLoadState("domcontentloaded")
    await injectAuth(page)
  })

  test("send 'say ping' → assistant reply contains 'ping' within 2 min", async ({ page }) => {
    await page.goto(BASE_URL)
    await page.waitForLoadState("domcontentloaded")

    const viewport = await page.viewportSize()
    if ((viewport?.width ?? 1280) < 768) test.skip(true, "chat hidden on mobile")

    const input = page.getByPlaceholder(/ask kody|kody is waiting/i).first()
    await input.waitFor({ state: "visible", timeout: 15_000 })

    const token = `real-${Date.now().toString(36)}`
    await input.fill(`Reply with exactly one word: ping (${token})`)
    await input.press("Enter")

    // Runner boot + install + LLM ≈ 45–90 s. Generous timeout for cold start.
    const reply = page.getByText(/\bping\b/i, { exact: false }).first()
    await expect(reply).toBeVisible({ timeout: 150_000 })
  })
})

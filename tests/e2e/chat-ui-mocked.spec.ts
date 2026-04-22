/**
 * @fileoverview UI-only chat tests — mock /api/kody/chat/trigger and
 * /api/kody/events/stream at the Playwright route level so we can assert
 * how the UI reacts to dispatch success/failure and streaming events
 * without ever touching GitHub or spinning up a runner.
 *
 * @testFramework playwright
 * @domain e2e-mocked
 */

import { test, expect, type Page } from "@playwright/test"

const BASE_URL = process.env.BASE_URL ?? "https://kody-dashboard-sable.vercel.app"
const TEST_TOKEN = process.env.E2E_GITHUB_TOKEN ?? "ghp_e2e-test-placeholder"
const TEST_REPO = process.env.E2E_GITHUB_REPO ?? "https://github.com/test-owner/test-repo"

function parseRepo(url: string): { owner: string; repo: string } {
  try {
    const u = new URL(url)
    const parts = u.pathname.replace(/^\//, "").split("/").filter(Boolean)
    return { owner: parts[0] ?? "test-owner", repo: parts[1] ?? "test-repo" }
  } catch {
    return { owner: "test-owner", repo: "test-repo" }
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
      user: { login: "ui-mock-test", avatar_url: "", id: 1 },
      loggedInAt: Date.now(),
    },
  )
}

/**
 * Build an SSE response body string from a list of events.
 * Each event becomes one `data: {json}\n\n` frame.
 */
function sseBody(events: unknown[]): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")
}

test.describe("Chat UI — mocked backend", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/login`)
    await page.waitForLoadState("domcontentloaded")
    await injectAuth(page)
  })

  test("happy path: user sends message, assistant reply renders", async ({ page }) => {
    // Trigger route returns success.
    await page.route("**/api/kody/chat/trigger", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, taskId: "mock-session", workflowId: "kody2.yml" }),
      }),
    )

    // SSE stream pushes connected → chat.message → chat.done.
    await page.route("**/api/kody/events/stream*", (route) =>
      route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        },
        body: sseBody([
          { type: "connected", sessionId: "mock-session" },
          {
            type: "chat.message",
            sessionId: "mock-session",
            role: "assistant",
            content: "pong from mock",
            timestamp: new Date().toISOString(),
          },
          { type: "chat.done", sessionId: "mock-session" },
        ]),
      }),
    )

    await page.goto(BASE_URL)
    await page.waitForLoadState("domcontentloaded")

    const viewport = await page.viewportSize()
    if ((viewport?.width ?? 1280) < 768) test.skip(true, "chat hidden on mobile")

    const input = page.getByPlaceholder(/ask kody|kody is waiting/i).first()
    await input.waitFor({ state: "visible", timeout: 10_000 })
    await input.fill("ping")
    await input.press("Enter")

    await expect(page.getByText("pong from mock")).toBeVisible({ timeout: 10_000 })
  })

  test("failure path: dispatch 500 surfaces an error bubble", async ({ page }) => {
    await page.route("**/api/kody/chat/trigger", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Not Found - https://docs.github.com/rest/actions/workflows#create-a-workflow-dispatch-event",
        }),
      }),
    )

    await page.goto(BASE_URL)
    await page.waitForLoadState("domcontentloaded")

    const viewport = await page.viewportSize()
    if ((viewport?.width ?? 1280) < 768) test.skip(true, "chat hidden on mobile")

    const input = page.getByPlaceholder(/ask kody|kody is waiting/i).first()
    await input.waitFor({ state: "visible", timeout: 10_000 })
    await input.fill("hi")
    await input.press("Enter")

    // The UI renders the error as an assistant message (matches current behavior).
    await expect(page.getByText(/Not Found/).first()).toBeVisible({ timeout: 10_000 })
  })

  test("stream chat.error surfaces in the UI without breaking the input", async ({ page }) => {
    await page.route("**/api/kody/chat/trigger", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, taskId: "mock-err", workflowId: "kody2.yml" }),
      }),
    )

    await page.route("**/api/kody/events/stream*", (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: sseBody([
          { type: "connected", sessionId: "mock-err" },
          { type: "chat.error", sessionId: "mock-err", error: "LiteLLM proxy died" },
        ]),
      }),
    )

    await page.goto(BASE_URL)
    await page.waitForLoadState("domcontentloaded")

    const viewport = await page.viewportSize()
    if ((viewport?.width ?? 1280) < 768) test.skip(true, "chat hidden on mobile")

    const input = page.getByPlaceholder(/ask kody|kody is waiting/i).first()
    await input.waitFor({ state: "visible", timeout: 10_000 })
    await input.fill("hi")
    await input.press("Enter")

    await expect(page.getByText(/LiteLLM/i).first()).toBeVisible({ timeout: 10_000 })
    // Input should still be usable after an error.
    await expect(input).toBeEnabled()
  })
})

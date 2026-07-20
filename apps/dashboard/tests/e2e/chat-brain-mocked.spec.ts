/**
 * @fileoverview Browser contract for the current chat picker boundary.
 * AI Agency agents and chat models are separate controls.
 *
 * @testFramework playwright
 * @domain e2e-mocked
 */

import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.PW_LOCAL
  ? "http://127.0.0.1:3333"
  : (process.env.BASE_URL ?? "http://127.0.0.1:3333");
const CHAT_URL = `${BASE_URL}/repo/test-owner/test-repo/chat`;

function sseBody(events: unknown[]): string {
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
}

async function seedAuth(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => {
    const auth = {
      repoUrl: "https://github.com/test-owner/test-repo",
      owner: "test-owner",
      repo: "test-repo",
      token: "ghp_placeholder",
      user: { login: "chat-picker-e2e", avatar_url: "", id: 1 },
      loggedInAt: Date.now(),
      // Legacy configuration must not reintroduce internal picker entries.
      brain: { url: "https://brain.example.test", apiKey: "brain-key-123" },
    };
    localStorage.setItem("kody_auth", JSON.stringify(auth));
    localStorage.setItem(
      "kody-default-chat-entry:test-owner/test-repo",
      "brain",
    );
    localStorage.removeItem("kody-sessions-v3:test-owner/test-repo");
    localStorage.removeItem("kody-sessions-v3");
  });
}

test.describe("Chat picker backend boundary", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/kody/agents", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          agent: [
            {
              slug: "research",
              title: "Research",
              body: "Research agent",
              updatedAt: "",
              htmlUrl: "",
            },
            {
              slug: "ux",
              title: "UX",
              body: "UX agent",
              updatedAt: "",
              htmlUrl: "",
            },
            {
              slug: "ceo",
              title: "CEO",
              body: "CEO agent",
              updatedAt: "",
              htmlUrl: "",
            },
          ],
        }),
      }),
    );
    await page.route(/\/api\/kody\/agents\/[^/?]+(?:\?.*)?$/, async (route) => {
      const slug = route.request().url().split("/").pop();
      const known = {
        research: "Research",
        ux: "UX",
        ceo: "CEO",
      } as const;
      const title = known[slug as keyof typeof known];
      if (!title) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "not_found" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          agentMember: {
            slug,
            title,
            body: `${title} agent`,
            updatedAt: "",
            htmlUrl: "",
          },
        }),
      });
    });
    await page.route("**/api/kody/models", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          models: [{ id: "openai/gpt-5", label: "Kody Test", enabled: true }],
        }),
      }),
    );
    await seedAuth(page);
  });

  test("keeps agency and model selection separate", async ({ page }) => {
    await page.goto(CHAT_URL);
    await expect(page).toHaveURL(CHAT_URL);

    const chat = page.locator('[aria-label="Kody chat"]').first();
    const title = chat.getByTestId("chat-context-bar");
    await expect(title).toContainText("Global chat — not tied to any task");
    const agentPicker = chat.getByLabel("Agency agent").first();
    await expect(agentPicker).toBeVisible({ timeout: 15_000 });
    await agentPicker.click();

    const menu = chat.locator('[role="listbox"]:visible').first();
    await expect(
      menu.locator('button[role="option"]').filter({ hasText: "Kody" }),
    ).toBeVisible();
    await expect(
      menu.locator('button[role="option"]').filter({ hasText: "Research" }),
    ).toBeVisible();
    await page.locator("body").click({ position: { x: 4, y: 4 } });
    await expect(menu).toBeHidden();

    await agentPicker.click();
    await chat
      .locator('[role="listbox"]:visible')
      .first()
      .locator('button[role="option"]')
      .filter({ hasText: "Research" })
      .click();
    await expect(agentPicker).toContainText("research");
    await expect(title).toContainText("Global chat — not tied to any task");

    const modelPicker = chat.getByLabel("Model").first();
    await modelPicker.click();
    const modelMenu = chat.locator('[role="listbox"]:visible').first();
    await expect(
      modelMenu.locator('button[role="option"]').filter({
        hasText: "Kody Test",
      }),
    ).toBeVisible();
    await expect(
      modelMenu.locator('button[role="option"]').filter({
        hasText: "Kody Brain",
      }),
    ).toBeVisible();
    await expect(
      modelMenu.locator('button[role="option"]').filter({
        hasText: "Kody Live",
      }),
    ).toBeVisible();
    await page.locator("body").click({ position: { x: 4, y: 4 } });
    await expect(modelMenu).toBeHidden();

    await modelPicker.click();
    await chat
      .locator('[role="listbox"]:visible')
      .first()
      .locator('button[role="option"]')
      .filter({ hasText: "Kody Test" })
      .click();

    const effortPicker = chat.getByLabel("Effort").first();
    await effortPicker.click();
    const effortMenu = chat.locator('[role="listbox"]:visible').first();
    await expect(effortMenu).toBeVisible();
    await page.locator("body").click({ position: { x: 4, y: 4 } });
    await expect(effortMenu).toBeHidden();
  });

  test("persists an agent handoff and sends it as identity context", async ({
    page,
  }) => {
    const requestBodies: Array<Record<string, unknown>> = [];
    await page.route("**/api/kody/chat/kody", async (route) => {
      requestBodies.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
        },
        body: sseBody([
          { type: "text-delta", delta: "Agent reply" },
          { type: "finish" },
        ]),
      });
    });

    await page.goto(CHAT_URL);
    const chat = page.locator('[aria-label="Kody chat"]').first();
    const agentPicker = chat.getByLabel("Agency agent").first();
    await expect(agentPicker).toBeVisible({ timeout: 15_000 });

    const modelPicker = chat.getByLabel("Model").first();
    await modelPicker.click();
    await chat
      .locator('[role="listbox"]:visible')
      .first()
      .locator('button[role="option"]')
      .filter({ hasText: "Kody Test" })
      .click();

    await agentPicker.click();
    await chat
      .locator('[role="listbox"]:visible')
      .first()
      .locator('button[role="option"]')
      .filter({ hasText: "UX" })
      .click();

    const composer = chat.locator("textarea").first();
    await composer.fill("Who are you?");
    await chat.getByRole("button", { name: "Send message" }).click();
    await expect(chat.getByText("Agent reply")).toBeVisible();

    await agentPicker.click();
    await chat
      .locator('[role="listbox"]:visible')
      .first()
      .locator('button[role="option"]')
      .filter({ hasText: "CEO" })
      .click();
    await expect(chat.getByTestId("agent-handoff")).toHaveText("UX → CEO");

    await composer.fill("Who are you now?");
    await chat.getByRole("button", { name: "Send message" }).click();
    await expect.poll(() => requestBodies.length).toBe(2);

    expect(requestBodies[1]?.agentSlug).toBe("ceo");
    expect(requestBodies[1]?.agentHandoff).toEqual({
      fromSlug: "ux",
      fromTitle: "UX",
      toSlug: "ceo",
      toTitle: "CEO",
      switchedAt: expect.any(String),
    });
    expect(requestBodies[1]?.messages).toEqual([
      expect.objectContaining({ role: "user", content: "Who are you now?" }),
    ]);
    expect(requestBodies[1]?.agentHandoffContext).toContain(
      "User: Who are you?",
    );
    expect(requestBodies[1]?.agentHandoffContext).toContain(
      "Previous agent: Agent reply",
    );

    await expect
      .poll(() =>
        page.evaluate(() =>
          localStorage
            .getItem("kody-sessions-v3:test-owner/test-repo")
            ?.includes('"toSlug":"ceo"'),
        ),
      )
      .toBe(true);
    const persisted = await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem("kody-sessions-v3:test-owner/test-repo") ?? "{}",
      ),
    );
    const activeSession = persisted.sessions.find(
      (session: { id: string }) => session.id === persisted.activeSessionId,
    );
    expect(activeSession.agencyAgent).toEqual({ slug: "ceo", title: "CEO" });
    expect(
      persisted.messages[persisted.activeSessionId].some(
        (message: { agentHandoff?: unknown }) => message.agentHandoff,
      ),
    ).toBe(false);
    await page.reload();
    await expect(chat.getByTestId("agent-handoff")).toHaveText("UX → CEO");
    await expect(agentPicker).toContainText("ceo");
  });

  test("keeps the current agent when server validation fails", async ({
    page,
  }) => {
    await page.route("**/api/kody/agents/ceo", (route) =>
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "not_found" }),
      }),
    );
    await page.goto(CHAT_URL);
    const chat = page.locator('[aria-label="Kody chat"]').first();
    const agentPicker = chat.getByLabel("Agency agent").first();

    await agentPicker.click();
    await chat
      .locator('[role="listbox"]:visible')
      .first()
      .locator('button[role="option"]')
      .filter({ hasText: "CEO" })
      .click();

    await expect(agentPicker).toContainText("kody");
    await expect(chat.getByTestId("agent-handoff")).toHaveCount(0);
    await expect(page.getByText("Could not switch to CEO")).toBeVisible();
  });
});

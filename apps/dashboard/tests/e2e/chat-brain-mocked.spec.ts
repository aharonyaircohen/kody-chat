/**
 * @fileoverview Browser contract for the current chat picker boundary.
 * AI Agency agents and chat models are separate controls.
 *
 * @testFramework playwright
 * @domain e2e-mocked
 */

import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3333";

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
          ],
        }),
      }),
    );
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
    await page.goto(`${BASE_URL}/chat`);
    await expect(page).toHaveURL(/\/repo\/test-owner\/test-repo\/chat$/);

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
});

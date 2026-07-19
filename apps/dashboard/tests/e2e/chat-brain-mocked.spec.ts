/**
 * @fileoverview Browser contract for the current chat picker boundary.
 * Brain and Live are internal runners, not user-selectable model entries.
 * Custom gateway models are the only entries exposed by this picker.
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

test.describe("Chat picker internal-runner boundary", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/kody/models", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          models: [{ id: "test/model", label: "Kody Test", enabled: true }],
        }),
      }),
    );
    await seedAuth(page);
  });

  test("keeps Brain and Live out of the picker while exposing custom models", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/chat`);
    await expect(page).toHaveURL(/\/repo\/test-owner\/test-repo\/chat$/);

    const chat = page.locator('[aria-label="Kody chat"]').first();
    const picker = chat.getByLabel("Model").first();
    await expect(picker).toBeVisible({ timeout: 15_000 });
    await picker.click();

    const menu = chat.locator('[role="listbox"]:visible').first();
    await expect(
      menu.locator('button[role="option"]').filter({ hasText: "Kody Test" }),
    ).toBeVisible();
    await expect(
      menu.locator('button[role="option"]').filter({ hasText: "Kody Brain" }),
    ).toHaveCount(0);
    await expect(
      menu.locator('button[role="option"]').filter({ hasText: "Kody Live" }),
    ).toHaveCount(0);
  });
});

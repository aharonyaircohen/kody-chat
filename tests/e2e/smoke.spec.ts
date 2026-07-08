/**
 * @fileoverview Smoke layer: the key routes load and their core chrome
 * mounts. No deep interactions — this suite must stay fast (`pnpm
 * test:smoke`). Deep behavior lives in the e2e layer (admin-chat-regression,
 * client-chat-surface, chat-live-flow).
 *
 * @testFramework playwright
 * @domain smoke-mocked
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
      user: { login: "smoke-e2e", avatar_url: "", id: 1 },
      loggedInAt: Date.now(),
    };
    localStorage.setItem("kody_auth", JSON.stringify(auth));
    localStorage.setItem(
      "kody-default-chat-entry:test-owner/test-repo",
      "kody:gpt-x",
    );
  });
}

test.describe("Route smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/kody/models", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          models: [{ id: "gpt-x", label: "GPT X", enabled: true }],
        }),
      }),
    );
    await seedAuth(page);
  });

  test("/ mounts the dashboard shell with the chat rail", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator('[aria-label="Kody chat"]').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("/chat mounts the admin chat with a composer", async ({ page }) => {
    await page.goto(`${BASE_URL}/chat`);
    await page.waitForLoadState("domcontentloaded");
    const chat = page.locator('[aria-label="Kody chat"]').first();
    await expect(chat).toBeVisible({ timeout: 15_000 });
    await expect(chat.locator("textarea").first()).toBeVisible();
  });

  test("/client/kody mounts the client chat surface", async ({ page }) => {
    await page.goto(`${BASE_URL}/client/kody`);
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator('[data-testid="client-chat-surface"]'),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator('[data-testid="kody-chat-root"]').first(),
    ).toBeVisible();
  });
});

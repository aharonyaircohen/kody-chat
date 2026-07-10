/**
 * @fileoverview Browser smoke: the key kody-chat routes load and their core
 * chrome mounts. No deep interactions — deep behavior lives in
 * client-chat-surface / chat-renderer-output. (HTTP-level smoke without a
 * browser is `pnpm test:smoke`.)
 *
 * @testFramework playwright
 * @domain smoke-mocked
 */

import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3344";

async function seedAuth(page: import("@playwright/test").Page): Promise<void> {
  await page.goto(`${BASE_URL}/`);
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => {
    localStorage.setItem(
      "kody_auth",
      JSON.stringify({
        repoUrl: "https://github.com/test-owner/test-repo",
        owner: "test-owner",
        repo: "test-repo",
        token: "ghp_placeholder",
        user: { login: "smoke-e2e", avatar_url: "", id: 1 },
        loggedInAt: Date.now(),
      }),
    );
  });
}

test.describe("Route smoke", () => {
  test("/ mounts the operator shell with sidepanel and chat", async ({
    page,
  }) => {
    await seedAuth(page);
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator('[data-testid="chat-shell"]')).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.locator('[aria-label="Primary navigation"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="kody-chat-root"]').first(),
    ).toBeVisible();
  });

  test("sidepanel navigates to the models page", async ({ page }) => {
    await seedAuth(page);
    await page.goto(`${BASE_URL}/models`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator('[data-testid="chat-shell"]')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("link", { name: "Secrets" })).toBeVisible();
  });

  test("sidebar shows version, theme toggle, and collapse", async ({
    page,
  }) => {
    await seedAuth(page);
    await page.goto(`${BASE_URL}/`);
    const sidebar = page.locator('[aria-label="Primary navigation"]');
    await expect(sidebar).toBeVisible({ timeout: 15_000 });
    await expect(sidebar.getByText(/^v\d+\.\d+/)).toBeVisible();
    await expect(
      sidebar.getByRole("button", { name: /Switch to (light|dark) mode/ }),
    ).toBeVisible();
    await expect(
      sidebar.getByRole("button", { name: "Collapse sidebar" }),
    ).toBeVisible();
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

  test("unknown brand renders not-found, not a crash", async ({ page }) => {
    const res = await page.goto(`${BASE_URL}/client/unknown-brand-xyz`);
    expect(res?.status()).toBe(404);
  });
});

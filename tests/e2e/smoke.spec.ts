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

test.describe("Route smoke", () => {
  test("/ redirects to the default brand client surface", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/client\/kody$/);
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

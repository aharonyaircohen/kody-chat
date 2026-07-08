/**
 * @fileoverview Guard the admin Kody chat controls while client chat is added.
 * The client surface must not remove admin model selection, reasoning effort,
 * or sessions from /chat.
 *
 * @testFramework playwright
 * @domain e2e-mocked
 */

import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3333";
const TEST_REPO = "https://github.com/test-owner/test-repo";

async function seedAuth(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => {
    const auth = {
      repoUrl: "https://github.com/test-owner/test-repo",
      owner: "test-owner",
      repo: "test-repo",
      token: "ghp_placeholder",
      user: { login: "admin-chat-e2e", avatar_url: "", id: 1 },
      loggedInAt: Date.now(),
    };
    localStorage.setItem("kody_auth", JSON.stringify(auth));
    localStorage.setItem(
      "kody-default-chat-entry:test-owner/test-repo",
      "kody:gpt-x",
    );
    localStorage.removeItem("kody-sessions-v3:test-owner/test-repo");
    localStorage.removeItem("kody-sessions-v3");
  });
}

test.describe("Admin Kody chat regression", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/kody/models", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          models: [
            {
              id: "gpt-x",
              label: "GPT X",
              enabled: true,
              reasoning: {
                default: "medium",
                efforts: [
                  { value: "low", label: "Low" },
                  { value: "medium", label: "Medium" },
                  { value: "high", label: "High" },
                ],
              },
            },
            { id: "claude-y", label: "Claude Y", enabled: true },
          ],
        }),
      }),
    );
    await page.route("**/api/kody/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: true,
          user: { login: "admin-chat-e2e", avatar_url: "", id: 1 },
        }),
      }),
    );
    await seedAuth(page);
  });

  test("/chat keeps models, reasoning, and sessions", async ({ page }) => {
    await page.goto(`${BASE_URL}/chat`);
    await page.waitForLoadState("domcontentloaded");

    const chat = page.locator('[aria-label="Kody chat"]').first();
    await expect(chat).toBeVisible({ timeout: 15_000 });

    const picker = chat.locator('button[aria-haspopup="listbox"]').first();
    await expect(picker).toBeVisible({ timeout: 15_000 });
    await picker.click();

    const listbox = page.getByRole("listbox").filter({
      has: page.getByRole("option", { name: /GPT X|Claude Y|Kody Live/i }),
    });
    await expect(listbox).toBeVisible();
    await expect(
      listbox.getByRole("option", { name: /Kody Live/i }),
    ).toBeVisible();
    await expect(listbox.getByRole("option", { name: /GPT X/i })).toBeVisible();
    await expect(
      listbox.getByRole("option", { name: /Claude Y/i }),
    ).toBeVisible();
    await listbox.getByRole("option", { name: /GPT X/i }).click();

    await expect(
      chat.locator('button[title^="Thinking level"]').first(),
    ).toHaveAttribute("title", /Medium/);
    await expect(
      chat.getByRole("button", { name: "Toggle conversations" }),
    ).toBeVisible();
    await expect(chat.getByRole("button", { name: /Terminal/i })).toBeVisible();
  });
});

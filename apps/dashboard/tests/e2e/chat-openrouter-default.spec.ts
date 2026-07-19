import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3333";

async function seedAuth(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.evaluate(() => {
    localStorage.setItem(
      "kody_auth",
      JSON.stringify({
        repoUrl: "https://github.com/test-owner/test-repo",
        owner: "test-owner",
        repo: "test-repo",
        token: "ghp_placeholder",
        user: { login: "chat-picker-e2e", avatar_url: "", id: 1 },
        loggedInAt: Date.now(),
      }),
    );
    localStorage.removeItem("kody-sessions-v3:test-owner/test-repo");
    localStorage.removeItem("kody-sessions-v3");
  });
}

test("shows OpenRouter Free in the chat header model picker", async ({
  page,
}) => {
  await page.route("**/api/kody/models", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ models: [] }),
    }),
  );
  await seedAuth(page);

  await page.goto(`${BASE_URL}/chat`);
  await expect(page).toHaveURL(/\/repo\/test-owner\/test-repo\/chat$/);

  const chat = page.locator('[aria-label="Kody chat"]').first();
  const picker = chat.getByLabel("Model").first();
  await expect(picker).toBeVisible({ timeout: 15_000 });
  await picker.click();

  const menu = chat.locator('[role="listbox"]:visible').first();
  await expect(
    menu.locator('button[role="option"]').filter({
      hasText: "OpenRouter Free",
    }),
  ).toBeVisible();
});

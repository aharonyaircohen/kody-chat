/**
 * @fileoverview Browser contract for visible Brain terminal setup failures.
 * @testFramework playwright
 * @domain terminal
 */
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
        user: { login: "terminal-e2e", avatar_url: "", id: 1 },
        loggedInAt: Date.now(),
      }),
    );
    localStorage.setItem("kody:chat-first-layout", "0");
  });
}

test("shows setup and credential recovery instead of a blank Brain terminal", async ({
  page,
}) => {
  await page.route("**/api/kody/chat/conversations**", (route) =>
    route.fulfill({
      status: route.request().method() === "POST" ? 201 : 200,
      contentType: "application/json",
      body: JSON.stringify(
        route.request().method() === "POST"
          ? { conversationId: "terminal-conversation" }
          : { conversations: [] },
      ),
    }),
  );
  await page.route("**/api/kody/models*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ models: [] }),
    }),
  );
  await page.route("**/api/kody/fly/machines", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        running: 1,
        total: 1,
        machines: [
          {
            feature: "brain",
            app: "kody-brain-terminal-e2e",
            machineId: "brain-1",
            state: "started",
            region: "fra",
            label: "Brain",
            sizeLabel: "performance-1x",
            orgSlug: "personal",
          },
        ],
      }),
    }),
  );
  await page.route("**/api/kody/terminal/session", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "terminal_gateway_not_ready",
        message: "Terminal setup is required for this Brain.",
      }),
    }),
  );
  let setupRequests = 0;
  await page.route("**/api/kody/terminal/setup", (route) => {
    setupRequests += 1;
    return route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        error: "fly_access_denied",
        message: "Fly token cannot access this Brain app.",
      }),
    });
  });

  await seedAuth(page);
  await page.goto(
    `${BASE_URL}/repo/test-owner/test-repo/tasks`,
    { waitUntil: "domcontentloaded" },
  );
  await page.locator('summary[aria-label="More compose options"]').click();
  await page.getByRole("button", { name: /^Terminal / }).click();
  const target = page.getByLabel("Terminal target");
  await expect(target).toBeVisible();
  await target.selectOption("brain");

  const issue = page.getByTestId("terminal-startup-issue");
  await expect(issue).toContainText("Terminal setup required");
  await expect(page.getByLabel("Restart terminal").first()).toBeDisabled();
  await issue.getByRole("button", { name: "Set up terminal" }).click();

  await expect.poll(() => setupRequests).toBe(1);
  await expect(issue).toContainText("Brain access needs attention");
  await expect(issue.getByRole("link", { name: "Open Secrets" })).toHaveAttribute(
    "href",
    "/repo/test-owner/test-repo/secrets",
  );
});

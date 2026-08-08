import { expect, test, type Page, type Route } from "@playwright/test";

import { mockDashboardShellRequests } from "./support/dashboard-shell-mocks";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3333";

async function seedAuth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      "kody_auth",
      JSON.stringify({
        repoUrl: "https://github.com/test-owner/test-repo",
        owner: "test-owner",
        repo: "test-repo",
        token: "ghp_placeholder",
        user: { login: "models-openrouter-e2e", avatar_url: "", id: 1 },
        loggedInAt: Date.now(),
      }),
    );
  });
}

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

test("configures the built-in OpenRouter Free model for Engine runs", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const failedResponses: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message
        .text()
        .startsWith("Encountered a script tag while rendering React component")
    ) {
      consoleErrors.push(message.text());
    }
  });
  page.on("requestfailed", (request) =>
    failedRequests.push(`${request.method()} ${request.url()}`),
  );
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  await seedAuth(page);
  await mockDashboardShellRequests(page);
  await page.route("**/api/kody/auth/me", (route) =>
    json(route, {
      authenticated: true,
      user: { login: "models-openrouter-e2e", avatar_url: "", githubId: 1 },
    }),
  );
  await page.route("**/api/kody/commands", (route) =>
    json(route, { commands: [] }),
  );
  await page.route("**/api/kody/agents", (route) => json(route, { agent: [] }));
  await page.route("https://api.github.com/user", (route) =>
    json(route, {
      login: "models-openrouter-e2e",
      avatar_url: "",
      id: 1,
    }),
  );
  await page.route("**/api/kody/engine/status", (route) =>
    json(route, { status: "ready" }),
  );
  await page.route("**/api/kody/workflow-events**", (route) =>
    json(route, { deliveries: [] }),
  );
  await page.route("**/api/kody/guided-flows**", (route) =>
    json(route, { flows: [], definitions: [] }),
  );
  await page.route("**/api/kody/chat/conversations**", (route) => {
    const isCollection = new URL(route.request().url()).pathname.endsWith(
      "/conversations",
    );
    return json(route, isCollection ? { conversations: [] } : { ok: true });
  });

  let models: unknown[] = [];
  let savedBody: { models?: Array<Record<string, unknown>> } | null = null;
  await page.route("**/api/kody/models", async (route) => {
    if (route.request().method() === "PUT") {
      savedBody = route.request().postDataJSON() as typeof savedBody;
      models = savedBody?.models ?? [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, models }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ models }),
    });
  });

  await page.goto(`${BASE_URL}/repo/test-owner/test-repo/models`);
  await expect(page).toHaveURL(/\/repo\/test-owner\/test-repo\/models$/);

  const openRouterRow = page.locator("li").filter({
    has: page.getByText("OpenRouter Free", { exact: true }),
  });
  await expect(openRouterRow).toBeVisible();
  await expect(openRouterRow).toContainText("OpenRouter · openrouter/free");
  await expect(
    openRouterRow.getByRole("button", { name: "Delete" }),
  ).toHaveCount(0);

  await openRouterRow.getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit model" });
  await dialog
    .getByText("Default for engine (Kody Live, issue + PR runs)")
    .click();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();

  await expect(openRouterRow).toContainText("Engine");
  expect(savedBody).not.toBeNull();
  expect(savedBody!.models).toContainEqual(
    expect.objectContaining({
      id: "openrouter/free",
      provider: "openrouter",
      modelName: "openrouter/free",
      apiKeySecret: "OPENROUTER_API_KEY",
      engineDefault: true,
    }),
  );
  expect(pageErrors).toEqual([]);
  expect(failedResponses).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

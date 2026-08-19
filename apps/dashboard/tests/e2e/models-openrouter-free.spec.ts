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

test("configures the built-in OpenRouter Free model for personal Chat", async ({
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
    failedRequests.push(
      `${request.method()} ${request.url()} ${request.failure()?.errorText ?? "unknown"}`,
    ),
  );
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  await seedAuth(page);
  await page.route("**/api/kody/chat/machines**", (route) =>
    json(route, { machines: [] }),
  );
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
  await page.route("**/api/kody/system-events**", (route) =>
    json(route, { ok: true }),
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
  await page.route("**/api/kody/account/credentials", (route) =>
    json(route, { credentials: [] }),
  );

  let models: unknown[] = [
    {
      id: "anthropic/primary",
      label: "Primary",
      provider: "anthropic",
      adapter: "anthropic",
      adapterBaseURL: "https://api.anthropic.com/v1",
      protocol: "anthropic",
      baseURL: "https://api.anthropic.com/v1",
      modelName: "primary",
      apiKeySecret: "ANTHROPIC_API_KEY",
      enabled: true,
      default: true,
      engineDefault: false,
    },
  ];
  let automatic = { default: false, engineDefault: false };
  let engineSavedBody: {
    models?: Array<Record<string, unknown>>;
    automatic?: { default?: boolean; engineDefault?: boolean };
  } | null = null;
  await page.route("**/api/kody/engine-models", async (route) => {
    if (route.request().method() === "PUT") {
      engineSavedBody = route.request().postDataJSON() as typeof engineSavedBody;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, ...engineSavedBody }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ models, automatic }),
    });
  });
  let savedBody: {
    models?: Array<Record<string, unknown>>;
    automatic?: { default?: boolean; engineDefault?: boolean };
  } | null = null;
  await page.route("**/api/kody/models", async (route) => {
    if (route.request().method() === "PUT") {
      savedBody = route.request().postDataJSON() as typeof savedBody;
      models = savedBody?.models ?? [];
      automatic = {
        default: savedBody?.automatic?.default === true,
        engineDefault: savedBody?.automatic?.engineDefault === true,
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, models, automatic }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ models, automatic }),
    });
  });

  const machineResponse = page.waitForResponse((response) =>
    response.url().includes("/api/kody/chat/machines"),
  );
  await page.goto(`${BASE_URL}/repo/test-owner/test-repo/models`);
  await machineResponse;
  await expect(page).toHaveURL(/\/repo\/test-owner\/test-repo\/models$/);

  const openRouterRow = page.locator("li").filter({
    has: page.getByText("OpenRouter Free", { exact: true }),
  });
  await expect(openRouterRow).toBeVisible();
  await expect(openRouterRow).toContainText("OpenRouter · openrouter/free");
  await expect(openRouterRow.getByRole("checkbox")).toHaveCount(1);

  const primaryRow = page.locator("li").filter({
    has: page.getByText("Primary", { exact: true }),
  });
  const automaticChatDefault = page.getByRole("checkbox", {
    name: "Use Automatic as the Chat default",
  });
  const automaticEngineDefault = page.getByRole("checkbox", {
    name: "Use Automatic as the Engine default",
  });
  await expect(automaticChatDefault).toBeDisabled();
  await expect(automaticEngineDefault).toBeDisabled();
  await expect(
    primaryRow.getByRole("button", { name: /Move Primary .*Automatic/ }),
  ).toHaveCount(0);

  await openRouterRow
    .getByRole("checkbox", { name: "Include OpenRouter Free in Automatic" })
    .click();
  await primaryRow
    .getByRole("checkbox", { name: "Include Primary in Automatic" })
    .click();
  await expect(automaticChatDefault).toBeEnabled();
  await expect(automaticEngineDefault).toBeEnabled();
  await expect(page.getByText("Uses 2 selected models in order")).toBeVisible();

  await primaryRow
    .getByRole("button", { name: "Move Primary up in Automatic" })
    .click();
  await expect(page.locator("li").first()).toContainText("Primary");
  expect(
    (
      savedBody as unknown as {
        models: Array<{ id: string; automatic?: boolean }>;
      }
    ).models
      .filter((model) => model.automatic === true)
      .map((model) => ({ id: model.id, automatic: model.automatic })),
  ).toEqual([
    { id: "anthropic/primary", automatic: true },
    { id: "openrouter/free", automatic: true },
  ]);

  await openRouterRow
    .getByRole("button", { name: "More actions for OpenRouter Free" })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Disable model" }),
  ).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await automaticChatDefault.click();
  await automaticEngineDefault.click();
  await expect(
    page.locator('[title="Used for new conversations"]'),
  ).toContainText("Chat");
  const automaticSavedBody = savedBody as unknown as {
    models: Array<Record<string, unknown>>;
    automatic: { default?: boolean; engineDefault?: boolean };
  };
  expect(automaticSavedBody.automatic).toEqual({
    default: true,
    engineDefault: false,
  });
  expect(engineSavedBody).not.toBeNull();
  const engineAutomaticSavedBody = engineSavedBody as unknown as {
    automatic: { engineDefault?: boolean };
  };
  expect(engineAutomaticSavedBody.automatic).toMatchObject({
    engineDefault: true,
  });
  expect(
    automaticSavedBody.models.find((model) => model.id === "anthropic/primary"),
  ).toMatchObject({
    default: false,
  });
  expect(
    automaticSavedBody.models.every((model) => model.engineDefault !== true),
  ).toBe(true);
  expect(
    automaticSavedBody.models.every((model) => model.default !== true),
  ).toBe(true);
  expect(pageErrors).toEqual([]);
  expect(failedResponses).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(
    failedRequests.filter(
      (failure) =>
        !failure.includes("/api/kody/chat/machines net::ERR_ABORTED"),
    ),
  ).toEqual([]);
});

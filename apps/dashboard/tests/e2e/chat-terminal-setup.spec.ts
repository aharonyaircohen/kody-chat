/**
 * @fileoverview Browser contract for visible Brain terminal setup failures.
 * @testFramework playwright
 * @domain terminal
 */
import { expect, test, type Page } from "@playwright/test";
import {
  mockDashboardShellRequests,
  mockKodyAccountSession,
} from "./support/dashboard-shell-mocks";

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
        user: { login: "terminal-e2e", avatar_url: "", id: 1 },
        loggedInAt: Date.now(),
      }),
    );
    localStorage.setItem("kody:chat-first-layout", "0");
  });
}

test("opens terminal after navigating from personal credentials without resetting the draft", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText !== "net::ERR_ABORTED") {
      errors.push(`${request.url()}: ${request.failure()?.errorText}`);
    }
  });
  await page.route("**/api/kody/**", (route) =>
    route.fulfill({
      json: {
        reports: [],
        collaborators: [],
        boards: [],
        tasks: [],
        counts: {},
      },
    }),
  );
  await mockDashboardShellRequests(page);
  await seedAuth(page);
  await page.route("**/api/kody/brain/status", (route) =>
    route.fulfill({
      json: {
        machines: [
          {
            feature: "brain",
            app: "terminal-e2e",
            machineId: "brain-1",
            state: "started",
            region: "fra",
            label: "Brain",
          },
        ],
      },
    }),
  );
  let sessionRequests = 0;
  await page.route("**/api/kody/terminal/session", (route) => {
    sessionRequests += 1;
    return route.fulfill({
      json: {
        webSocketUrl: "ws://terminal.test/session",
        session: {
          id: "terminal-1",
          scope: {
            owner: "test-owner",
            repo: "test-repo",
            conversationId: "terminal-conversation",
          },
          target: { kind: "brain", runtimeId: "brain-1" },
        },
      },
    });
  });
  await page.routeWebSocket("ws://terminal.test/session", (socket) => {
    socket.onMessage(() =>
      socket.send(
        JSON.stringify({
          type: "state",
          sessionId: "terminal-1",
          generation: 1,
          state: "ready",
        }),
      ),
    );
  });

  // A full load on Personal Credentials initializes the persistent chat with
  // personal plugins. Returning to a repository must update that same chat.
  await page.goto(`${BASE_URL}/secrets`, { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Personal Credentials", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Keep this draft");
  await page.getByRole("link", { name: /^Kody home/ }).click();
  await expect(page).toHaveURL(`${BASE_URL}/repo/test-owner/test-repo`);
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true }),
  ).toHaveValue("Keep this draft");
  await page.locator('summary[aria-label="More compose options"]').click();
  await page.getByRole("button", { name: /^Terminal / }).click();
  await expect(page.getByLabel("Terminal target")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send command", exact: true }),
  ).toBeEnabled();
  expect(sessionRequests).toBeGreaterThan(0);
  await page.getByRole("button", { name: "AI chat", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true }),
  ).toHaveValue("Keep this draft");
  await page.getByRole("button", { name: "Personal", exact: true }).click();
  await page
    .getByRole("link", { name: "Personal Credentials", exact: true })
    .click();
  await expect(page).toHaveURL(`${BASE_URL}/secrets`);
  await expect(page.getByRole("button", { name: /^Terminal / })).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true }),
  ).toHaveValue("Keep this draft");
  await page.getByRole("button", { name: /^Terminal / }).click();
  await expect(page.getByLabel("Terminal target")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send command", exact: true }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});

test("shows setup and credential recovery instead of a blank Brain terminal", async ({
  page,
}) => {
  await mockKodyAccountSession(page, {
    id: "terminal-e2e",
    name: "Terminal E2E",
  });
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
  await page.route("**/api/kody/brain/status", (route) =>
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
  await page.goto(`${BASE_URL}/repo/test-owner/test-repo/tasks`, {
    waitUntil: "domcontentloaded",
  });
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
  await expect(
    issue.getByRole("link", { name: "Open Secrets" }),
  ).toHaveAttribute("href", "/repo/test-owner/test-repo/secrets");
  // The failure overlay must not cover the composer's mode buttons.
  await page
    .getByRole("button", { name: "AI chat", exact: true })
    .click({ timeout: 5000 });
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true }),
  ).toBeVisible();
});

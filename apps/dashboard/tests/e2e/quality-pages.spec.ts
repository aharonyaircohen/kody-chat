import { expect, test, type Route } from "@playwright/test";

const auth = {
  repoUrl: "https://github.com/acme/widgets",
  owner: "acme",
  repo: "widgets",
  token: "e2e-token",
  user: { login: "e2e-test", avatar_url: "", id: 1 },
  loggedInAt: Date.now(),
};

const qualityMap = {
  actions: [
    {
      slug: "send-message",
      name: "Send a message",
      outcome: "The user sends one chat message.",
      area: "Chat",
      status: "active",
      updatedAt: "2026-08-09T12:00:00.000Z",
    },
  ],
  journeys: [
    {
      slug: "direct-chat-persists",
      name: "Direct chat survives reload",
      goal: "A user can return to a saved direct chat.",
      priority: "critical",
      status: "active",
      actionSlugs: ["send-message"],
      updatedAt: "2026-08-09T12:00:00.000Z",
    },
  ],
  scenarios: [
    {
      slug: "reply-persists",
      journeySlug: "direct-chat-persists",
      name: "Reply persists after reload",
      kind: "persistence",
      given: "A connected repository and configured direct model.",
      expectedVisible: "The same reply is visible after reload.",
      expectedState: "The conversation and messages remain stored.",
      testId: "direct-kody-chat",
      cleanup: "Remove the test conversation.",
      status: "active",
      updatedAt: "2026-08-09T12:00:00.000Z",
    },
  ],
  runs: [
    {
      runId: "run-1",
      runSlug: "reply-persists-20260809",
      journeySlug: "direct-chat-persists",
      scenarioSlug: "reply-persists",
      environment: "local",
      targetUrl: "http://127.0.0.1:3333",
      sourceCommit: "abc123",
      definitionUpdatedAt: "2026-08-09T12:00:00.000Z",
      status: "passed",
      latestEvent: {
        type: "quality_run_completed",
        summary: "Direct chat persistence passed.",
        artifactPath: "apps/dashboard/test-results/live-ui-gate/run-1",
        artifactUrl: "https://github.com/acme/widgets/actions/runs/42",
        passed: 1,
        failed: 0,
      },
      createdAt: "2026-08-09T12:00:00.000Z",
      updatedAt: "2026-08-09T12:02:00.000Z",
    },
  ],
  currentSourceCommit: "abc123",
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((value) => {
    window.localStorage.setItem("kody_auth", JSON.stringify(value));
  }, auth);
  await page.route("**/api/kody/auth/me", (route) =>
    json(route, {
      authenticated: true,
      user: { login: "e2e-test", avatar_url: "", githubId: 1 },
    }),
  );
  await page.route("**/api/kody/quality/**", (route) =>
    json(route, qualityMap),
  );
});

for (const pageCase of [
  { path: "actions", title: "Actions", item: "Send a message" },
  {
    path: "journeys",
    title: "Journeys",
    item: "Direct chat survives reload",
  },
  {
    path: "scenarios",
    title: "Scenarios",
    item: "Reply persists after reload",
  },
  {
    path: "runs",
    title: "Quality Runs",
    item: "Reply persists after reload",
  },
] as const) {
  test(`manages ${pageCase.title} from a repository-scoped page`, async ({
    page,
  }) => {
    await page.goto(`/repo/acme/widgets/quality/${pageCase.path}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", { name: pageCase.title, exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(pageCase.item, { exact: true })).toBeVisible();
    await expect(
      page.getByPlaceholder(`Search ${pageCase.path}...`),
    ).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`/repo/acme/widgets/quality/${pageCase.path}$`),
    );
  });
}

test("creates, edits, and deletes an Action", async ({ page }) => {
  let actions: typeof qualityMap.actions = [];
  await page.unroute("**/api/kody/quality/**");
  await page.route("**/api/kody/quality/**", async (route) => {
    const method = route.request().method();
    if (method === "POST") {
      actions = [route.request().postDataJSON()];
      return json(route, { ok: true }, 201);
    }
    if (method === "DELETE") {
      actions = [];
      return route.fulfill({ status: 204 });
    }
    return json(route, { ...qualityMap, actions });
  });

  await page.goto("/repo/acme/widgets/quality/actions");
  await page.getByRole("button", { name: "New action" }).click();
  await page.getByLabel("Name").fill("Open a conversation");
  await page.getByLabel("User outcome").fill("The user opens Chat.");
  await page.getByLabel("Product area").fill("Chat");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByText("Open a conversation", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("User outcome").fill("The user opens a saved Chat.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("The user opens a saved Chat.")).toBeVisible();

  await page.getByRole("button", { name: "Delete" }).click();
  await page
    .getByRole("button", { name: "Delete", exact: true })
    .last()
    .click();
  await expect(page.getByText("No Actions yet")).toBeVisible();
});

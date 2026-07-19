import { expect, test, type Route } from "@playwright/test";

const auth = {
  repoUrl: "https://github.com/acme/widgets",
  owner: "acme",
  repo: "widgets",
  token: "e2e-token",
  user: { login: "e2e-test", avatar_url: "", id: 1 },
  loggedInAt: Date.now(),
};

const journey = {
  journeyId: "create-workflow",
  name: "Create a workflow",
  goal: "A user can create and review a workflow.",
  status: "active",
  priority: "critical",
  currentVersion: 2,
  updatedAt: new Date().toISOString(),
  health: "passed",
  latestRun: { runId: "run-1", status: "passed", environment: "preview" },
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((value) => {
    window.localStorage.setItem("kody_auth", JSON.stringify(value));
  }, auth);
  await page.route("**/api/kody/auth/me", (route) =>
    json(route, { authenticated: true, user: { login: "e2e-test", avatar_url: "", githubId: 1 } }),
  );
});

test("shows journey health and queues a run without navigating", async ({ page }) => {
  const methods: string[] = [];
  await page.route("**/api/kody/user-journeys", async (route) => {
    methods.push(route.request().method());
    if (route.request().method() === "GET") {
      await json(route, { journeys: [journey] });
      return;
    }
    await json(route, { runId: "run-2", status: "queued" }, 201);
  });

  await page.goto("/repo/acme/widgets/user-journeys", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "User Journeys" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Create a workflow", { exact: true })).toBeVisible();
  await expect(page.getByText("Passing", { exact: true })).toBeVisible();

  const urlBefore = page.url();
  await page.getByRole("button", { name: "Run locally" }).click();
  await expect(page).toHaveURL(urlBefore);
  expect(methods).toContain("POST");
});

test("creates a journey from the page", async ({ page }) => {
  let saved = false;
  await page.route("**/api/kody/user-journeys", async (route) => {
    if (route.request().method() === "GET") {
      await json(route, { journeys: saved ? [journey] : [] });
      return;
    }
    saved = true;
    await json(route, { result: { version: 1 } }, 201);
  });

  await page.goto("/repo/acme/widgets/user-journeys", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "User Journeys" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "New journey" }).click();
  await page.getByLabel("Name").fill("Review a workflow");
  await page.getByRole("textbox", { name: "Goal" }).fill("A user can review a workflow.");
  await page.getByRole("button", { name: "Save journey" }).click();
  await expect(page.getByText("Create a workflow", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/repo\/acme\/widgets\/user-journeys$/);
});

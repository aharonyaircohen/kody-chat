import { expect, test, type Page } from "@playwright/test";

const OWNER = "test-owner";
const REPO = "test-repo";
const CANONICAL_TASKS_URL = `/repo/${OWNER}/${REPO}/tasks`;

async function seedAuth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      "kody_auth",
      JSON.stringify({
        repoUrl: "https://github.com/test-owner/test-repo",
        owner: "test-owner",
        repo: "test-repo",
        token: "ghp_placeholder",
        user: { login: "favorites-e2e", avatar_url: "", id: 1 },
        loggedInAt: Date.now(),
      }),
    );
  });
}

test("user can favorite a page and keep it after reload", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const failedResponses: string[] = [];
  let storedFavoriteHrefs: string[] = [];
  const completedSavedBodies: unknown[] = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(`${message.location().url}: ${message.text()}`);
    }
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.method()} ${request.url()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  await seedAuth(page);
  await page.route("**/api/kody/navigation-favorites", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as {
        favoriteHrefs: string[];
      };
      storedFavoriteHrefs = body.favoriteHrefs;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ favoriteHrefs: storedFavoriteHrefs }),
      });
      completedSavedBodies.push(body);
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ favoriteHrefs: storedFavoriteHrefs }),
    });
  });
  await page.route("**/api/kody/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        user: { login: "favorites-e2e", avatar_url: "", githubId: 1 },
        owner: OWNER,
        repo: REPO,
      }),
    }),
  );
  await page.route("**/api/kody/agents", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ agent: [] }),
    }),
  );
  await page.route("**/api/kody/models", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ models: [] }),
    }),
  );
  await page.route("**/api/kody/brain/models", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ models: [] }),
    }),
  );
  await page.route("**/api/kody/guided-flows", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ flows: [] }),
    }),
  );
  await page.route("**/api/kody/commands", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ commands: [] }),
    }),
  );
  await page.route("**/api/kody/dashboard-config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ config: {} }),
    }),
  );
  await page.route("**/api/kody/secrets/FLY_API_TOKEN/value", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ exists: false }),
    }),
  );
  await page.route("**/api/kody/tasks**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ tasks: [], counts: {} }),
    }),
  );

  await page.goto(CANONICAL_TASKS_URL);
  const navigation = page.getByRole("complementary", {
    name: "Primary navigation",
  });
  await expect(navigation).toBeVisible();

  await navigation
    .getByRole("button", { name: "Add Tasks to favorites" })
    .click();

  const favorites = navigation.getByRole("region", {
    name: "Favorite pages",
  });
  await expect(favorites).toBeVisible();
  await expect(favorites.getByText("Favorites", { exact: true })).toHaveCount(
    0,
  );
  await expect(favorites.getByRole("link", { name: "Tasks" })).toBeVisible();
  await expect.poll(() => completedSavedBodies).toContainEqual({
    favoriteHrefs: ["/tasks"],
  });

  await page.reload();
  await expect(
    navigation.getByRole("region", { name: "Favorite pages" }),
  ).toBeVisible();

  await favorites
    .getByRole("button", { name: "Remove Tasks from favorites" })
    .click();
  await expect(favorites).toHaveCount(0);
  await expect.poll(() => completedSavedBodies).toContainEqual({
    favoriteHrefs: [],
  });

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(failedResponses).toEqual([]);
});

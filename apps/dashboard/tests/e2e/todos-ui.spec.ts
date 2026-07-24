import { expect, test, type Page } from "@playwright/test";

const todo = {
  slug: "restore-todos-ui",
  path: "todos/restore-todos-ui.json",
  title: "Restore Todos UI",
  outcome: "Bring back the clear list and item-card experience.",
  status: "in-progress",
  evidence: ["Previous layout reference"],
  checklist: [
    { id: "item-1", text: "Restore the master list", done: true },
    { id: "item-2", text: "Verify the detail view", done: false },
  ],
  blockers: [],
  runIds: ["run-1"],
  createdAt: "2026-07-24T00:00:00.000Z",
  updatedAt: "2026-07-24T00:00:00.000Z",
  sha: "",
  htmlUrl: "",
};

async function seedAuth(page: Page) {
  await page.goto("/login");
  await page.evaluate(() => {
    localStorage.setItem(
      "kody_auth",
      JSON.stringify({
        repoUrl: "https://github.com/test-owner/test-repo",
        owner: "test-owner",
        repo: "test-repo",
        token: "ghp_placeholder",
        user: { login: "todos-e2e", avatar_url: "", id: 1 },
        loggedInAt: Date.now(),
      }),
    );
  });
}

test.describe("Todos restored UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/kody/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: true,
          user: { login: "todos-e2e", avatar_url: "", id: 1 },
        }),
      }),
    );
    await page.route("**/api/kody/models", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ models: [] }),
      }),
    );
    await page.route("**/api/kody/todos", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ todos: [todo] }),
      }),
    );
    await page.route("**/api/kody/todos/restore-todos-ui", async (route) => {
      if (route.request().method() === "PATCH") {
        Object.assign(todo, route.request().postDataJSON());
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ todo }),
      });
    });
    await seedAuth(page);
  });

  test("shows the old master-detail experience with current Todo data", async ({
    page,
  }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });

    await page.goto("/repo/test-owner/test-repo/todos/restore-todos-ui");
    const heading = page.getByRole("heading", { name: "Restore Todos UI" });
    const errorState = page.getByText("This page hit an error");
    await Promise.race([
      heading.waitFor({ state: "visible" }),
      errorState.waitFor({ state: "visible" }),
    ]);
    if (await errorState.isVisible()) {
      throw new Error(browserErrors.join("\n") || "Todos page hit an error");
    }

    await expect(page).toHaveURL(
      /\/repo\/test-owner\/test-repo\/todos\/restore-todos-ui$/,
    );
    await expect(heading).toBeVisible();
    await expect(
      page.getByRole("searchbox", { name: "Search todos" }),
    ).toBeVisible();
    await expect(page.getByText("Verify the detail view")).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit todo" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Delete todo" }),
    ).toBeVisible();

    const checklistToggle = page.getByRole("checkbox", {
      name: /Verify the detail view/,
    });
    await checklistToggle.click();
    await expect(checklistToggle).toHaveAttribute("aria-checked", "true");
    expect(browserErrors).toEqual([]);
  });
});

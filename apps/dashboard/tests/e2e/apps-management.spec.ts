/** @testFramework playwright @domain e2e-mocked */
import { expect, test, type Page } from "@playwright/test";
import { mockKodyAccountSession } from "./support/dashboard-shell-mocks";

async function seedRepository(page: Page) {
  await page.addInitScript(() => {
    const repo = {
      repoUrl: "https://github.com/test-owner/test-repo",
      owner: "test-owner",
      repo: "test-repo",
      token: "ghp_placeholder",
      user: { login: "apps-e2e", avatar_url: "", id: 1 },
      addedAt: Date.now(),
      isLogin: true,
    };
    localStorage.setItem(
      "kody_auth",
      JSON.stringify({
        ...repo,
        loggedInAt: Date.now(),
        repos: [repo],
        currentRepoIndex: 0,
      }),
    );
  });
}

test.describe("Apps management", () => {
  test("manages a selected App and hands new setup to Kody Chat", async ({
    page,
  }) => {
    let appStatus = "stopped";
    await mockKodyAccountSession(page, { id: "apps-e2e", name: "Apps E2E" });
    await seedRepository(page);
    await page.route("**/api/kody/apps", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          apps: [
            {
              appId: "22222222-2222-4222-8222-222222222222",
              name: "Storefront",
              slug: "storefront",
              repository: "lfnovo/open-notebook",
              branch: "main",
              rootDirectory: "apps/web",
              observedStatus: appStatus,
              desiredStatus: appStatus,
              exposure: "private",
              provider: { publicUrl: "https://storefront.fly.dev" },
              currentDeploymentId: "33333333-3333-4333-8333-333333333333",
              secretNames: ["DATABASE_URL"],
              accessTokens: [
                {
                  tokenId: "token-1",
                  name: "Default consumer",
                  createdAt: new Date().toISOString(),
                },
              ],
              domains: [{ hostname: "shop.example.com", status: "ready" }],
              storage: [],
              updatedAt: new Date().toISOString(),
            },
          ],
        }),
      }),
    );
    await page.route("**/api/kody/chat/conversations**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ conversations: [] }),
      }),
    );
    await page.route("**/api/kody/models*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ models: [] }),
      }),
    );
    await page.route("**/api/kody/apps/storefront/actions", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      appStatus = "running";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, status: "running" }),
      });
    });
    await page.route("**/api/kody/apps/storefront/open", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          url: "https://storefront.fly.dev/?ka=short-lived-ticket",
        }),
      }),
    );
    await page.addInitScript(() => {
      Object.defineProperty(window, "open", {
        configurable: true,
        value: () => ({
          opener: null,
          location: {
            replace: (url: string) => {
              document.documentElement.dataset.openedAppUrl = url;
            },
          },
          close: () => undefined,
        }),
      });
    });

    await page.goto("/repo/test-owner/test-repo/apps/storefront");
    await expect(
      page.getByRole("heading", { name: "Apps", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Storefront" }),
    ).toBeVisible();
    await expect(
      page.getByText("lfnovo/open-notebook@main:apps/web"),
    ).toBeVisible();
    await expect(page.getByText("Consumer token required")).toBeVisible();
    await expect(page.getByText("Stopped — not serving traffic")).toBeVisible();
    await page
      .getByRole("button", { name: "Start app" })
      .filter({ visible: true })
      .first()
      .click();
    await expect(page.getByText("Starting app…").first()).toBeVisible();
    await expect(
      page.getByText("Running — ready to open").first(),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Open app" })
      .filter({ visible: true })
      .first()
      .click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-opened-app-url",
      "https://storefront.fly.dev/?ka=short-lived-ticket",
    );
    await page.getByRole("button", { name: "Environment" }).click();
    await expect(page.getByText("Runtime secret names")).toBeVisible();
    await expect(page.getByText("Default consumer")).toBeVisible();

    await page.getByRole("button", { name: "New app" }).click();
    await expect(page).toHaveURL(/\/repo\/test-owner\/test-repo\/chat$/);
    await expect(page.locator("textarea").first()).toHaveValue(
      "Set up this repository as an app",
    );
  });

  test("repairs a missing Fly app when the user clicks Start", async ({
    page,
  }) => {
    let appStatus = "failed";
    let deploymentRequests = 0;
    await mockKodyAccountSession(page, {
      id: "apps-repair-e2e",
      name: "Apps Repair E2E",
    });
    await seedRepository(page);
    await page.route("**/api/kody/apps", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          apps: [
            {
              appId: "22222222-2222-4222-8222-222222222222",
              name: "Open Notebook",
              slug: "open-notebook",
              repository: "lfnovo/open-notebook",
              branch: "main",
              rootDirectory: ".",
              observedStatus: appStatus,
              desiredStatus: "running",
              exposure: "private",
              provider: { publicUrl: "https://open-notebook.fly.dev" },
              currentDeploymentId: "33333333-3333-4333-8333-333333333333",
              secretNames: [],
              accessTokens: [],
              domains: [],
              storage: [],
              updatedAt: new Date().toISOString(),
            },
          ],
        }),
      }),
    );
    await page.route(
      "**/api/kody/apps/open-notebook/actions",
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        appStatus = "running";
        await route.fulfill({
          status: 202,
          contentType: "application/json",
          body: JSON.stringify({
            status: "deploying",
            repairing: true,
          }),
        });
      },
    );
    await page.route(
      "**/api/kody/apps/open-notebook/deployments",
      async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              deployments: [
                {
                  deploymentId: "33333333-3333-4333-8333-333333333333",
                  commitSha: "a".repeat(40),
                  status: "failed",
                  createdAt: new Date().toISOString(),
                },
              ],
            }),
          });
          return;
        }
        deploymentRequests += 1;
        await route.fulfill({
          status: 202,
          contentType: "application/json",
          body: JSON.stringify({ status: "building" }),
        });
      },
    );

    await page.goto("/repo/test-owner/test-repo/apps/open-notebook");
    await expect(
      page.getByText("Failed — open logs for details"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Start app", exact: true }).click();
    await expect(page.getByText("Starting app…").first()).toBeVisible();
    await expect(
      page.getByText("Running — ready to open").first(),
    ).toBeVisible();
    expect(deploymentRequests).toBe(0);
  });
});

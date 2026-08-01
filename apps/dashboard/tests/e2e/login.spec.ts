/**
 * @fileoverview First-run repository setup E2E tests.
 * @testFramework playwright
 * @domain e2e
 *
 * The dashboard no longer has a dedicated /login route. First-run auth lives in
 * the root dashboard shell as a repository setup form.
 */

import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3333";
const TEST_REPO =
  process.env.E2E_GITHUB_REPO ?? "https://github.com/aharonyaircohen/kody-chat";

async function loadWithoutAuth(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/tasks`);
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => localStorage.removeItem("kody_auth"));
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
}

test.describe("Repository setup", () => {
  test.beforeEach(async ({ page }) => {
    await loadWithoutAuth(page);
  });

  test("renders first-run connect form", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /connect a repository/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/^repository$/i)).toBeVisible();
    await expect(page.getByLabel(/personal access token/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /connect repository/i }),
    ).toBeVisible();
  });

  test("shows Chat and starts onboarding before a repository is connected", async ({
    page,
  }, testInfo) => {
    await page.route("**/api/kody/chat/conversations**", async (route) => {
      const isCollection = new URL(route.request().url()).pathname.endsWith(
        "/conversations",
      );
      await route.fulfill({
        status: route.request().method() === "POST" && isCollection ? 201 : 200,
        contentType: "application/json",
        body: JSON.stringify(
          isCollection ? { conversations: [] } : { ok: true },
        ),
      });
    });
    await page.route("**/api/kody/models", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ models: [] }),
      }),
    );
    await page.route("**/api/kody/guided-flows", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ flows: [], definitions: [] }),
        });
        return;
      }
      const body = route.request().postDataJSON() as { flowId?: string };
      expect(body.flowId).toBe("onboarding");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          instance: { instanceId: "onboarding-instance", status: "active" },
          compatibility: { status: "compatible" },
          view: {
            action: "render_view",
            view: "renderer",
            id: "onboarding-welcome",
            rendererSlug: "approval-card",
            rendererName: "Approval card",
            resultTarget: "guided-flow",
            guidedFlow: {
              instanceId: "onboarding-instance",
              stepId: "welcome",
              revision: 0,
            },
            ui: {
              type: "stack",
              children: [
                {
                  type: "text",
                  value: "Welcome to Kody",
                  variant: "title",
                },
              ],
            },
            data: { title: "Welcome to Kody" },
          },
        }),
      });
    });

    await page.goto("/");

    const visibleChat = page.locator('[aria-label="Kody chat"]:visible');
    if (testInfo.project.name !== "mobile-chrome") {
      await expect(visibleChat).toBeVisible();
    }
    await page.getByRole("button", { name: "Start onboarding" }).click();
    await expect(visibleChat).toBeVisible();
    await expect(
      visibleChat.getByRole("heading", { name: "Welcome to Kody" }),
    ).toBeVisible();
  });

  test("shows validation error for invalid repository input", async ({
    page,
  }) => {
    await page.getByLabel(/^repository$/i).fill("not-a-valid-repo-url");
    await page.getByLabel(/personal access token/i).fill("ghp_test");
    await page.getByRole("button", { name: /connect repository/i }).click();

    await expect(page.getByText(/enter a github url/i)).toBeVisible();
  });

  test("shows API error for rejected token", async ({ page }) => {
    await page.route("**/api/kody/repos/add", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          error: "invalid_token",
          message: "GitHub rejected token (401). Check PAT and try again.",
        }),
      });
    });

    await page.getByLabel(/^repository$/i).fill(TEST_REPO);
    await page.getByLabel(/personal access token/i).fill("invalid-token");
    await page.getByRole("button", { name: /connect repository/i }).click();

    await expect(page.getByText(/github rejected token/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /connect repository/i }),
    ).toBeEnabled({ timeout: 15_000 });
  });

  test("stores auth after repository connects", async ({ page }) => {
    await page.route("**/api/kody/repos/add", async (route) => {
      const body = route.request().postDataJSON() as {
        owner: string;
        repo: string;
        token: string;
      };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          owner: body.owner,
          repo: body.repo,
          repository: {
            fullName: `${body.owner}/${body.repo}`,
            private: false,
            defaultBranch: "main",
            htmlUrl: `https://github.com/${body.owner}/${body.repo}`,
          },
          user: {
            login: "e2e-test",
            avatar_url: "https://github.com/github.png",
            id: 1,
          },
          webhook: { ok: true, created: false },
        }),
      });
    });

    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    await page.getByLabel(/^repository$/i).fill(TEST_REPO);
    await page.getByLabel(/personal access token/i).fill("ghp_mock_token");
    await page.getByRole("button", { name: /connect repository/i }).click();

    const authHandle = await page.waitForFunction(() =>
      localStorage.getItem("kody_auth"),
    );
    const rawAuth = await authHandle.jsonValue();
    expect(rawAuth).not.toBeNull();

    const repoUrl = new URL(TEST_REPO);
    const [expectedOwner, expectedRepo] = repoUrl.pathname
      .replace(/^\//, "")
      .split("/");

    const parsed = JSON.parse(String(rawAuth));
    expect(parsed.owner).toBe(expectedOwner);
    expect(parsed.repo).toBe(expectedRepo);
    expect(parsed.token).toBe("ghp_mock_token");
    expect(parsed.repos).toHaveLength(1);

    const jsErrors = errors.filter(
      (e) =>
        !e.includes("Extension context invalidated") &&
        !e.includes("chrome-extension") &&
        !e.includes("Failed to load resource"),
    );
    expect(jsErrors).toHaveLength(0);
  });
});

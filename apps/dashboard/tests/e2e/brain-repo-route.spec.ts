/**
 * @fileoverview Brain models stay inside the active repository workspace.
 * @testFramework playwright
 * @domain routing
 */
import { expect, test, type Page } from "@playwright/test";
import { mockDashboardShellRequests } from "./support/dashboard-shell-mocks";

const BASE_URL = process.env.PW_LOCAL
  ? "http://127.0.0.1:3333"
  : (process.env.BASE_URL ?? "http://127.0.0.1:3333");
const OWNER = "test-owner";
const REPO = "test-repo";
const BRAIN_URL = `${BASE_URL}/repo/${OWNER}/${REPO}/brain`;

async function seedRepoAuth(page: Page): Promise<void> {
  await page.addInitScript(
    ({ owner, repo }) => {
      const user = {
        login: "brain-route-e2e",
        avatar_url: "https://github.com/github.png",
        id: 1,
      };
      localStorage.setItem(
        "kody_auth",
        JSON.stringify({
          repoUrl: `https://github.com/${owner}/${repo}`,
          owner,
          repo,
          token: "ghp_placeholder",
          user,
          loggedInAt: Date.now(),
          repos: [
            {
              repoUrl: `https://github.com/${owner}/${repo}`,
              owner,
              repo,
              token: "ghp_placeholder",
              addedAt: Date.now(),
              isLogin: true,
              user,
            },
          ],
          currentRepoIndex: 0,
        }),
      );
    },
    { owner: OWNER, repo: REPO },
  );
  await mockDashboardShellRequests(page);
  await page.route("**/api/kody/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        user: {
          login: "brain-route-e2e",
          avatar_url: "https://github.com/github.png",
          githubId: 1,
        },
      }),
    }),
  );
}

test("renders Brain at its canonical repository URL", async ({ page }) => {
  await seedRepoAuth(page);

  await page.goto(BRAIN_URL);

  await expect(page).toHaveURL(BRAIN_URL);
  await expect(page.getByRole("heading", { name: "Brain" })).toBeVisible();
});

test("redirects the legacy Brain URL into the active repository", async ({
  page,
}) => {
  await seedRepoAuth(page);

  await page.goto(`${BASE_URL}/brain`);

  await expect(page).toHaveURL(BRAIN_URL);
  await expect(page.getByRole("heading", { name: "Brain" })).toBeVisible();
});

test("groups every Fly page under the Fly sidepanel menu", async ({ page }) => {
  await seedRepoAuth(page);
  await page.goto(BRAIN_URL);

  const navigation = page.getByRole("complementary", {
    name: "Primary navigation",
  });
  await navigation.getByRole("button", { name: "Fly", exact: true }).click();

  for (const path of [
    "config",
    "previews",
    "brain-images",
    "machines",
    "history",
  ]) {
    await expect(
      navigation.locator(`a[href="/repo/${OWNER}/${REPO}/fly/${path}"]`),
    ).toBeVisible();
  }
});

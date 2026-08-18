/**
 * @fileoverview Brain stays personal while repository Fly tools stay scoped.
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
const BRAIN_URL = `${BASE_URL}/brain`;

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

test("renders Brain at its canonical personal URL", async ({ page }) => {
  await seedRepoAuth(page);

  await page.goto(BRAIN_URL);

  await expect(page).toHaveURL(BRAIN_URL);
  await expect(
    page.getByRole("heading", { name: "Brain", exact: true }),
  ).toBeVisible();
});

test("redirects the old repository Brain URL to personal Brain", async ({
  page,
}) => {
  await seedRepoAuth(page);

  await page.goto(`${BASE_URL}/repo/${OWNER}/${REPO}/brain`);

  await expect(page).toHaveURL(BRAIN_URL);
  await expect(
    page.getByRole("heading", { name: "Brain", exact: true }),
  ).toBeVisible();
});

test("separates personal Chat Models from repository Engine Models", async ({
  page,
}) => {
  await seedRepoAuth(page);
  await page.goto(`${BASE_URL}/repo/${OWNER}/${REPO}/models`);

  await expect(
    page.getByText(
      "Your chat models and API keys belong to your Kody account.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Repository automation uses Engine Models configured in Variables.",
      { exact: true },
    ),
  ).toBeVisible();
  const variablesLink = page.getByRole("link", { name: "Variables" });
  await expect(variablesLink).toHaveAttribute(
    "href",
    `/repo/${OWNER}/${REPO}/variables`,
  );
  await variablesLink.click();
  await expect(
    page.getByText(
      "Repository settings shared across Engine runs. LLM_MODELS controls the repository's Engine Models.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("keeps personal and repository tools as explicit destinations", async ({
  page,
}) => {
  await seedRepoAuth(page);
  await page.goto(`${BASE_URL}/repo/${OWNER}/${REPO}/fly/machines`);

  const navigation = page.getByRole("complementary", {
    name: "Primary navigation",
  });
  for (const [label, href] of [
    ["Personal Commands", "/commands"],
    ["Personal Credentials", "/secrets"],
    ["Personal Memory", "/memory"],
    ["Repository Commands", `/repo/${OWNER}/${REPO}/commands`],
    ["Repository Secrets", `/repo/${OWNER}/${REPO}/secrets`],
    ["Repository Memory", `/repo/${OWNER}/${REPO}/memory`],
  ] as const) {
    const link = navigation.locator(`a[aria-label="${label}"]`);
    await expect(link).toHaveAttribute("href", href);
  }
});

test("shows Brain with the repository Fly tools", async ({ page }) => {
  await seedRepoAuth(page);
  await page.goto(`${BASE_URL}/repo/${OWNER}/${REPO}/fly/machines`);

  const navigation = page.getByRole("complementary", {
    name: "Primary navigation",
  });
  await expect(
    navigation.getByText("Repository", { exact: true }),
  ).toBeVisible();
  await expect(
    navigation.locator('[data-sidebar-repository-selector="true"]'),
  ).toBeVisible();
  await expect
    .poll(() =>
      navigation.evaluate((element) => {
        const label = [...element.querySelectorAll("p")].find(
          (candidate) => candidate.textContent?.trim() === "Repository",
        );
        const selector = element.querySelector(
          '[data-sidebar-repository-selector="true"]',
        );
        return Boolean(
          label &&
          selector &&
          label.compareDocumentPosition(selector) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        );
      }),
    )
    .toBe(true);
  await navigation.getByRole("button", { name: "Fly", exact: true }).click();

  await expect(navigation.locator('a[href="/brain"]')).toBeVisible();

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

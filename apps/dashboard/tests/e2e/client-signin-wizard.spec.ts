import { expect, test, type Route } from "@playwright/test";

const auth = {
  repoUrl: "https://github.com/acme/widgets",
  owner: "acme",
  repo: "widgets",
  token: "e2e-token",
  user: {
    login: "e2e-test",
    avatar_url: "https://github.com/github-mark.png",
    id: 1,
  },
  loggedInAt: Date.now(),
};

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
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
      user: { login: "e2e-test", avatar_url: auth.user.avatar_url, githubId: 1 },
    }),
  );
});

test("opens Client sign-in as the dedicated wizard", async ({ page }) => {
  await page.goto("/setup/client-signin?provider=google", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByRole("heading", { name: "Google sign-in setup" })).toBeVisible();
  await expect(page.getByText("Create a Google OAuth app")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/guidedFlow/);
});

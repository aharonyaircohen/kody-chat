import { expect, test } from "@playwright/test";

const githubToken = process.env.E2E_GITHUB_TOKEN;
const githubRepo = process.env.E2E_GITHUB_REPO;
const repoParts = githubRepo?.match(/(?:github\.com\/)?([^/]+)\/([^/]+?)(?:\.git)?$/);

test.skip(!githubToken || !repoParts, "Requires E2E_GITHUB_TOKEN and E2E_GITHUB_REPO for real verification");

const auth = {
  repoUrl: `https://github.com/${repoParts?.[1]}/${repoParts?.[2]}`,
  owner: repoParts?.[1] ?? "",
  repo: repoParts?.[2] ?? "",
  token: githubToken ?? "",
  user: { login: "", avatar_url: "https://github.com/github-mark.png", id: 0 },
  loggedInAt: Date.now(),
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((value) => window.localStorage.setItem("kody_auth", JSON.stringify(value)), auth);
});

test("loads real GuidedFlow templates without instances on the page", async ({ page }) => {
  await page.goto(`/repo/${repoParts?.[1]}/${repoParts?.[2]}/guided-flows`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Guided Flow Templates" })).toBeVisible();
  await expect(page.getByText("In progress", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "History", exact: true })).toHaveCount(0);
});

/**
 * @fileoverview Repo switcher e2e coverage.
 * @testFramework playwright
 * @domain routing
 */

import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3333";

const repos = [
  {
    repoUrl: "https://github.com/OrgOne/RepoOne",
    owner: "OrgOne",
    repo: "RepoOne",
    token: "ghp_fake_one",
    addedAt: 1,
    isLogin: true,
  },
  {
    repoUrl: "https://github.com/OrgTwo/RepoTwo",
    owner: "OrgTwo",
    repo: "RepoTwo",
    token: "ghp_fake_two",
    addedAt: 2,
    isLogin: false,
  },
];

async function seedAuth(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/`);
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate((entries) => {
    localStorage.setItem(
      "kody_auth",
      JSON.stringify({
        repoUrl: entries[0]!.repoUrl,
        owner: entries[0]!.owner,
        repo: entries[0]!.repo,
        token: entries[0]!.token,
        user: {
          login: "repo-switch-test",
          avatar_url: "https://github.com/github-mark.png",
          id: 1,
        },
        loggedInAt: Date.now(),
        repos: entries,
        currentRepoIndex: 0,
      }),
    );
  }, repos);
}

async function seedSingleRepoAuth(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/`);
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate((entry) => {
    localStorage.setItem(
      "kody_auth",
      JSON.stringify({
        ...entry,
        user: {
          login: "repo-switch-test",
          avatar_url: "https://github.com/github-mark.png",
          id: 1,
        },
        loggedInAt: Date.now(),
        repos: [entry],
        currentRepoIndex: 0,
      }),
    );
  }, repos[0]!);
}

test("header repo dropdown switches to another attached repo", async ({
  page,
}) => {
  await seedAuth(page);
  await page.goto(`${BASE_URL}/repo/OrgOne/RepoOne/tasks`);
  await page.waitForLoadState("domcontentloaded");

  await expect(page.getByRole("button", { name: "RepoOne" })).toBeVisible();
  await page.getByRole("button", { name: "RepoOne" }).click();

  const nextRepo = page.getByRole("button", { name: "RepoTwo", exact: true });
  await expect(nextRepo).toBeVisible();
  await nextRepo.click();

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = localStorage.getItem("kody_auth");
        if (!raw) return null;
        const auth = JSON.parse(raw) as {
          owner?: string;
          repo?: string;
          currentRepoIndex?: number;
        };
        return {
          owner: auth.owner,
          repo: auth.repo,
          currentRepoIndex: auth.currentRepoIndex,
        };
      }),
    )
    .toEqual({ owner: "OrgTwo", repo: "RepoTwo", currentRepoIndex: 1 });
  await expect(page).toHaveURL(/\/repo\/OrgTwo\/RepoTwo\/tasks$/);
  await expect(page.getByRole("button", { name: "RepoTwo" })).toBeVisible();
});

test("sidebar separates personal and repository navigation", async ({
  page,
}) => {
  await seedAuth(page);
  await page.goto(`${BASE_URL}/repo/OrgOne/RepoOne/tasks`);

  await expect(page.getByText("Account", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Personal" })).toBeVisible();
  await expect(page.getByText("Repository", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Personal" }).click();
  await expect(page.getByRole("link", { name: "Chat" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Memory" })).toBeVisible();
});

test("removing the final repository keeps the account and opens personal chat", async ({
  page,
}) => {
  await seedSingleRepoAuth(page);
  await page.goto(`${BASE_URL}/repo/OrgOne/RepoOne/tasks`);

  await page
    .getByRole("button", { name: /Switch repository: RepoOne|RepoOne/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Remove OrgOne/RepoOne" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();

  await expect(page).toHaveURL(/\/chat$/);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("kody_auth")))
    .toBeNull();
  await expect(page.getByText("Your private Chat")).toBeVisible();
});

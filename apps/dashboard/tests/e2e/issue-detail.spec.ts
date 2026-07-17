/**
 * @fileoverview E2E for the issue/task detail flow — the primary task surface.
 * @testFramework playwright
 * @domain e2e
 *
 * The board (`/`) links each card to `/[issueNumber]`; that detail page (and
 * its comments/preview children) had zero e2e coverage. This spec navigates
 * from the board to the first card's detail page and asserts it mounts, then
 * visits the comments sub-route. Skips when no live data (no token, empty
 * board) — same gate as dashboard-smoke.
 */

import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3333";
const TEST_TOKEN = process.env.E2E_GITHUB_TOKEN ?? "";
const TEST_REPO =
  process.env.E2E_GITHUB_REPO ??
  "https://github.com/aharonyaircohen/Kody-Dashboard";

function parseRepo(url: string): { owner: string; repo: string } {
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/^\//, "").split("/").filter(Boolean);
    return { owner: parts[0] ?? "", repo: parts[1] ?? "" };
  } catch {
    return { owner: "aharonyaircohen", repo: "Kody-Dashboard" };
  }
}

async function injectAuth(page: Page): Promise<void> {
  const { owner, repo } = parseRepo(TEST_REPO);
  await page.evaluate(
    (auth) => localStorage.setItem("kody_auth", JSON.stringify(auth)),
    {
      repoUrl: TEST_REPO,
      owner,
      repo,
      token: TEST_TOKEN,
      user: {
        login: "e2e-test",
        avatar_url: "https://github.com/github-mark.png",
        id: 1,
      },
      loggedInAt: Date.now(),
    },
  );
}

async function openFirstIssueDetail(page: Page): Promise<number | null> {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState("domcontentloaded");
  await injectAuth(page);
  await page.goto(`${BASE_URL}/`);
  await page.waitForLoadState("domcontentloaded");

  // Board cards link to /<issueNumber> — grab the first numeric link.
  const hrefs = await page
    .locator("a[href]")
    .evaluateAll((as) =>
      as
        .map((a) => a.getAttribute("href") ?? "")
        .filter((h) => /^\/\d+$/.test(h)),
    );
  if (hrefs.length === 0) return null;
  const issueNumber = Number(hrefs[0].slice(1));
  await page.goto(`${BASE_URL}/${issueNumber}`);
  await page.waitForLoadState("domcontentloaded");
  return issueNumber;
}

test.describe("Issue detail flow", () => {
  test.skip(!TEST_TOKEN, "E2E_GITHUB_TOKEN not set");

  test("board card opens the issue detail page", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const issueNumber = await openFirstIssueDetail(page);
    test.skip(issueNumber === null, "board has no issue cards");

    // Detail page mounted: shell visible, no client crash.
    await expect(page.locator("body")).toBeVisible();
    expect(errors, `page errors:\n${errors.join("\n")}`).toHaveLength(0);
  });

  test("issue comments sub-route renders", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const issueNumber = await openFirstIssueDetail(page);
    test.skip(issueNumber === null, "board has no issue cards");

    await page.goto(`${BASE_URL}/${issueNumber}/comments`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).toBeVisible();
    expect(errors, `page errors:\n${errors.join("\n")}`).toHaveLength(0);
  });
});

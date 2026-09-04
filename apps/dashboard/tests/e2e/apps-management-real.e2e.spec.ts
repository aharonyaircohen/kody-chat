/** @testFramework playwright @domain e2e-live */
import { expect, resolveLiveGitHubUser, test } from "./live-test";

const BASE_URL = process.env.BASE_URL ?? "";
const TOKEN = process.env.E2E_GITHUB_TOKEN ?? "";
const OWNER = "aharonyaircohen";
const REPO = "kody-chat";

test("starts and opens the real managed App", async ({ page }) => {
  test.setTimeout(900_000);
  test.skip(!BASE_URL || !TOKEN, "Requires the local target and QA account");

  const headers = {
    "x-kody-token": TOKEN,
    "x-kody-owner": OWNER,
    "x-kody-repo": REPO,
  };
  const user = await resolveLiveGitHubUser(page, BASE_URL, headers);
  await page
    .context()
    .addInitScript(
      (auth) => localStorage.setItem("kody_auth", JSON.stringify(auth)),
      {
        repoUrl: `https://github.com/${OWNER}/${REPO}`,
        owner: OWNER,
        repo: REPO,
        token: TOKEN,
        user,
        loggedInAt: Date.now(),
        repos: [],
        currentRepoIndex: 0,
      },
    );

  await page.goto(`${BASE_URL}/repo/${OWNER}/${REPO}/apps/open-notebook`, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("heading", { name: "open-notebook", exact: true }),
  ).toBeVisible({
    timeout: 30_000,
  });

  const stopButton = page.getByRole("button", { name: "Stop app", exact: true });
  if (await stopButton.isEnabled()) {
    const stopResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith("/api/kody/apps/open-notebook/actions"),
    );
    await stopButton.click();
    expect((await stopResponse).ok()).toBe(true);
    await expect(page.getByText("Stopped — not serving traffic")).toBeVisible({
      timeout: 30_000,
    });
  }

  const actionResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/api/kody/apps/open-notebook/actions"),
  );
  await page.getByRole("button", { name: "Start app", exact: true }).click();
  const start = await actionResponse;
  const startBody = await start.json().catch(() => ({}));
  expect([200, 202], `Start failed: ${JSON.stringify(startBody)}`).toContain(
    start.status(),
  );
  if (start.status() === 202) {
    expect(startBody).toMatchObject({ repairing: true, status: "deploying" });
    await expect(
      page.getByText("Deploying — building and checking health"),
    ).toBeVisible({ timeout: 30_000 });
  } else expect(startBody).toMatchObject({ status: "running" });
  await expect(page.getByText("Running — ready to open")).toBeVisible({
    timeout: 720_000,
  });

  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Open app", exact: true }).click();
  const appPage = await popupPromise;
  await appPage.waitForURL(/\.fly\.dev/, { timeout: 60_000 });
  await appPage.waitForLoadState("domcontentloaded");
  await expect(appPage.locator("body")).not.toContainText(
    "request_auth_required",
  );
  expect(new URL(appPage.url()).searchParams.has("ka")).toBe(false);
});

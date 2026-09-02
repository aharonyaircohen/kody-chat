/**
 * @testFramework playwright
 * @domain views-browser-live
 * @description Non-mutating mounted Views journey through the real Dashboard,
 * repository vault, Fly Machine, Chromium page stream, and browser controls.
 */
import { expect, test } from "@playwright/test";

import {
  establishLiveKodyAccountSession,
  loadLiveKodyAccountCredentials,
} from "./live-account-session";

const BASE_URL = process.env.BASE_URL ?? "";
const TOKEN =
  process.env.KODY_LIVE_GITHUB_TOKEN ??
  process.env.E2E_GITHUB_TOKEN ??
  process.env.GITHUB_TOKEN ??
  process.env.GH_TOKEN ??
  "";
const [OWNER, REPO] = (
  process.env.LIVE_BROWSER_REPOSITORY ?? "aharonyaircohen/kody-chat"
).split("/");

test("switches saved views in one real Fly browser and preserves history", async ({
  page,
}) => {
  test.setTimeout(180_000);
  test.skip(
    !BASE_URL || !TOKEN || !OWNER || !REPO,
    "Requires a live local target and GitHub token",
  );

  const credentials = await loadLiveKodyAccountCredentials({
    ...process.env,
    E2E_GITHUB_REPO: `https://github.com/${OWNER}/${REPO}`,
    E2E_GITHUB_TOKEN: TOKEN,
  });
  await establishLiveKodyAccountSession(page.request, BASE_URL, credentials);

  const headers = {
    "x-kody-token": TOKEN,
    "x-kody-owner": OWNER!,
    "x-kody-repo": REPO!,
  };
  const [identityResponse, configResponse] = await Promise.all([
    page.request.get(`${BASE_URL}/api/kody/auth/me`, { headers }),
    page.request.get(`${BASE_URL}/api/kody/dashboard-config`, { headers }),
  ]);
  expect(identityResponse.ok(), "Live GitHub identity must resolve").toBe(
    true,
  );
  expect(configResponse.ok(), "Saved views must load").toBe(true);
  const identity = (await identityResponse.json()) as {
    user?: { login?: string; avatar_url?: string; githubId?: number };
  };
  const config = (await configResponse.json()) as {
    config?: {
      namedPreviews?: Array<{ id: string; label: string; url?: string }>;
    };
  };
  const previews = (config.config?.namedPreviews ?? []).filter(
    (preview): preview is { id: string; label: string; url: string } =>
      Boolean(preview.id && preview.label && preview.url),
  );
  expect(
    previews.length,
    "The live repository needs two saved URL views",
  ).toBeGreaterThanOrEqual(2);
  const primary = previews[0]!;
  const secondary = previews[1]!;
  const actorLogin = identity.user?.login;
  expect(
    actorLogin,
    "Live GitHub identity must include a login",
  ).toBeTruthy();

  await page.addInitScript(
    (auth) => localStorage.setItem("kody_auth", JSON.stringify(auth)),
    {
      repoUrl: `https://github.com/${OWNER}/${REPO}`,
      owner: OWNER,
      repo: REPO,
      token: TOKEN,
      user: {
        login: actorLogin!,
        avatar_url: identity.user?.avatar_url ?? "",
        id: identity.user?.githubId ?? 0,
      },
      loggedInAt: Date.now(),
    },
  );

  await page.goto(`${BASE_URL}/repo/${OWNER}/${REPO}/preview/${primary.id}`, {
    waitUntil: "domcontentloaded",
  });
  const surface = page.locator("[data-remote-browser-surface]");
  const address = page.getByLabel("Current preview URL");
  await expect(surface).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Starting browser…")).toBeHidden({
    timeout: 60_000,
  });
  await expect(address).toHaveValue(primary.url, { timeout: 60_000 });

  await page.getByTitle(/Switch preview environment/).click();
  await page
    .getByRole("button", {
      name: `${secondary.label} ${secondary.url}`,
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(new RegExp(`/preview/${secondary.id}$`));
  await expect(address).toHaveValue(secondary.url, { timeout: 60_000 });
  await expect(page.getByText("Starting browser…")).toBeHidden();

  const back = page.getByLabel("Go back in preview");
  await expect(back).toBeEnabled({ timeout: 30_000 });
  await back.click();
  await expect(address).toHaveValue(primary.url, { timeout: 30_000 });
  const forward = page.getByLabel("Go forward in preview");
  await expect(forward).toBeEnabled({ timeout: 30_000 });
  await forward.click();
  await expect(address).toHaveValue(secondary.url, { timeout: 30_000 });

  await page.getByLabel("Inspector actions").click();
  await page.getByRole("menuitem", { name: "Pick element" }).click();
  await expect(surface).toBeVisible();
  await expect
    .poll(
      () =>
        surface.evaluate((element) => {
          const canvas = element as HTMLCanvasElement;
          return canvas.width > 0 && canvas.height > 0;
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
});

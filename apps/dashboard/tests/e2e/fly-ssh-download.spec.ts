import { expect, test, type Page } from "@playwright/test";
import { mockDashboardShellRequests } from "./support/dashboard-shell-mocks";
const OWNER = "test-owner";
const REPO = "test-repo";
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
  await page.route("**/api/kody/brain/status", (route) =>
    route.fulfill({ json: { machines: [] } }),
  );
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

test("downloads the selected machine profile and disables unprepared machines", async ({
  page,
}) => {
  await seedRepoAuth(page);
  await page.route("**/api/kody/fly/config-status", (route) =>
    route.fulfill({ json: { configured: true, source: "repo-vault" } }),
  );
  const row = {
    app: "test-app",
    machineId: "abc123",
    feature: "app",
    state: "started",
    region: "ams",
    label: "Ready machine",
    sizeLabel: "256 MB",
    sshConfigured: true,
  };
  await page.route("**/api/kody/fly/machines", (route) =>
    route.fulfill({
      json: {
        machines: [
          row,
          {
            ...row,
            machineId: "old123",
            label: "Old machine",
            sshConfigured: false,
          },
        ],
        running: 2,
        total: 2,
      },
    }),
  );
  let body: unknown;
  await page.route("**/api/kody/fly/machines/ssh", (route) => {
    body = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: "application/zip",
      body: Buffer.from("ssh-test-archive"),
    });
  });
  await page.goto(`/repo/${OWNER}/${REPO}/fly/machines`);
  const buttons = page.getByRole("button", {
    name: "Download SSH config",
    exact: true,
  });
  await expect(buttons).toHaveCount(2);
  await expect(buttons.nth(0)).toBeEnabled();
  await expect(page.getByText("Ready machine", { exact: true })).toBeVisible();
  const labelBox = await page
    .getByText("Ready machine", { exact: true })
    .boundingBox();
  expect(labelBox!.width).toBeGreaterThan(60);
  await expect(buttons.nth(1)).toBeDisabled();
  const downloaded = page.waitForEvent("download");
  await buttons.nth(0).click();
  expect((await downloaded).suggestedFilename()).toBe(
    "kody-test-app-abc123.zip",
  );
  expect(body).toEqual({ app: "test-app", machineId: "abc123" });
  await expect(
    page.getByText("SSH settings downloaded", { exact: true }),
  ).toBeVisible();
  await page.route("**/api/kody/fly/machines/ssh", (route) =>
    route.fulfill({
      status: 403,
      json: { error: "This machine belongs to another user" },
    }),
  );
  await buttons.nth(0).click();
  await expect(
    page.getByText("This machine belongs to another user", { exact: true }),
  ).toBeVisible();
  await expect(buttons.nth(0)).toBeEnabled();
});

test("downloads a personal Brain without repository Fly credentials", async ({
  page,
}) => {
  await seedRepoAuth(page);
  await page.route("**/api/kody/fly/config-status", (route) =>
    route.fulfill({ json: { configured: false, source: null } }),
  );
  await page.route("**/api/kody/brain/status", (route) =>
    route.fulfill({
      json: {
        machines: [
          {
            app: "kody-brain-own",
            machineId: "brain123",
            feature: "brain",
            state: "started",
            region: "ams",
            label: "My Brain",
            sizeLabel: "1 GB",
            sshConfigured: true,
          },
        ],
      },
    }),
  );
  await page.route("**/api/kody/fly/machines/ssh", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      app: "kody-brain-own",
      machineId: "brain123",
    });
    return route.fulfill({
      contentType: "application/zip",
      body: Buffer.from("archive"),
    });
  });
  await page.goto(`/repo/${OWNER}/${REPO}/fly/machines`);
  await expect(page.getByText("My Brain", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download SSH config", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "kody-kody-brain-own-brain123.zip",
  );
  let personalSuspend = false;
  await page.route("**/api/kody/brain/suspend", route => { personalSuspend = true; return route.fulfill({ json: { ok: true } }); });
  await page.getByTitle("Suspend (snapshot, ~$0)", { exact: true }).click();
  await expect.poll(() => personalSuspend).toBe(true);
});

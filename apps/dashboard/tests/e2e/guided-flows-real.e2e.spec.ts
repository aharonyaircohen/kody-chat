import { expect, test } from "./live-test";
import { anyApi } from "convex/server";

import { createBackendClient } from "@kody-ade/backend/client";

const githubToken = process.env.E2E_GITHUB_TOKEN;
const githubRepo = process.env.E2E_GITHUB_REPO;
const convexUrl = process.env.CONVEX_URL;
const serviceKey = process.env.KODY_SERVICE_KEY;
const repoParts = githubRepo?.match(
  /(?:github\.com\/)?([^/]+)\/([^/]+?)(?:\.git)?$/,
);

test.skip(
  !githubToken || !repoParts || !convexUrl || !serviceKey,
  "Requires GitHub and Convex credentials for real verification",
);

function authFor(owner: string, repo: string) {
  return {
    repoUrl: `https://github.com/${owner}/${repo}`,
    owner,
    repo,
    token: githubToken ?? "",
    user: {
      login: "",
      avatar_url: "https://github.com/github-mark.png",
      id: 0,
    },
    loggedInAt: Date.now(),
  };
}

test("loads real Guided Flow definitions", async ({ page }) => {
  await page.addInitScript(
    (value) => localStorage.setItem("kody_auth", JSON.stringify(value)),
    authFor(repoParts?.[1] ?? "", repoParts?.[2] ?? ""),
  );

  await page.goto(`/repo/${repoParts?.[1]}/${repoParts?.[2]}/guided-flows`, {
    waitUntil: "domcontentloaded",
  });

  await expect(
    page.getByRole("heading", { name: "Guided Flow Management" }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Create a workflow" }),
  ).toBeVisible();
});

test("creates, completes, persists, and cleans up a real custom flow", async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const owner = "guided-flow-e2e";
  const repo = `run-${suffix}`;
  const tenantId = `${owner}/${repo}`;
  const flowTitle = `Release check ${suffix}`;
  const flowId = `release-check-${suffix}`;

  await page.addInitScript(
    (value) => localStorage.setItem("kody_auth", JSON.stringify(value)),
    authFor(owner, repo),
  );
  // This journey deliberately uses an isolated Convex tenant that is not a
  // GitHub repository. The chat rail's Fly-availability probe is unrelated
  // to Guided Flows, so return empty vault metadata instead of asking GitHub
  // for a repository that must not exist.
  await page.route("**/api/kody/secrets", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"secrets":[]}',
    }),
  );
  await page.route("**/api/kody/system-events", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"ok":true}',
    }),
  );

  try {
    await page.goto(`/repo/${owner}/${repo}/guided-flows`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("button", { name: "Add Guided Flow", exact: true })
      .click();
    await page.getByLabel("Flow name").fill(flowTitle);
    await page
      .getByLabel("Step 1 renderer", { exact: true })
      .selectOption("approval-card");
    await page.getByRole("button", { name: "Save Guided Flow" }).click();
    await expect(page.getByRole("article", { name: flowTitle })).toBeVisible();

    await page.goto(
      `/repo/${owner}/${repo}/guided-flows?guidedFlow=${flowId}&instanceKey=${suffix}`,
      { waitUntil: "domcontentloaded" },
    );
    const openChat = page.getByRole("button", { name: "Open chat" });
    if (await openChat.isVisible()) await openChat.click();
    await expect(page.getByRole("button", { name: "Finish" })).toBeVisible();
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page.getByText("GuidedFlow completed.")).toBeVisible();

    const completed = await page.evaluate(async () => {
      const auth = JSON.parse(localStorage.getItem("kody_auth") ?? "{}") as {
        token?: string;
        owner?: string;
        repo?: string;
      };
      const response = await fetch("/api/kody/guided-flows", {
        headers: auth.token
          ? {
              "x-kody-token": auth.token,
              "x-kody-owner": auth.owner ?? "",
              "x-kody-repo": auth.repo ?? "",
            }
          : {},
      });
      return response.json();
    });
    expect(completed.flows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instance: expect.objectContaining({
            flowId,
            status: "completed",
          }),
        }),
      ]),
    );
  } finally {
    const client = createBackendClient(convexUrl);
    await client.mutation(anyApi.importExport.clearRepo, { tenantId });
  }
});

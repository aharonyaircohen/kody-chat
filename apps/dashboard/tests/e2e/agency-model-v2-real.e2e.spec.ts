import { expect, resolveLiveGitHubUser, test } from "./live-test";

const BASE_URL = process.env.BASE_URL ?? "";
const TEST_TOKEN = process.env.E2E_GITHUB_TOKEN ?? "";
const TEST_REPO = process.env.E2E_GITHUB_REPO ?? "";

function parseRepo(value: string) {
  const path = value.includes("://") ? new URL(value).pathname : value;
  const [owner = "", repo = ""] = path.replace(/^\/+|\/+$/g, "").split("/");
  return { owner, repo: repo.replace(/\.git$/i, "") };
}

test("shows the migrated V2 ownership and execution model from the real backend", async ({
  page,
}) => {
  test.setTimeout(120_000);
  test.skip(
    !BASE_URL || !TEST_TOKEN || !TEST_REPO,
    "Requires live repository credentials",
  );
  const { owner, repo } = parseRepo(TEST_REPO);
  const headers = {
    "x-kody-token": TEST_TOKEN,
    "x-kody-owner": owner,
    "x-kody-repo": repo,
  };
  const user = await resolveLiveGitHubUser(page, BASE_URL, headers);
  await page.context().addInitScript(
    ({ auth }) => {
      localStorage.clear();
      localStorage.setItem("kody_auth", JSON.stringify(auth));
    },
    {
      auth: {
        repoUrl: TEST_REPO,
        owner,
        repo,
        token: TEST_TOKEN,
        user,
        loggedInAt: Date.now(),
        repos: [
          {
            repoUrl: TEST_REPO,
            owner,
            repo,
            token: TEST_TOKEN,
            user,
            addedAt: Date.now(),
            isLogin: true,
          },
        ],
        currentRepoIndex: 0,
      },
    },
  );

  const definitionsResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/kody/agency-definitions") &&
      response.status() === 200,
  );
  const statesResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/kody/agency-states") &&
      response.request().method() === "GET" &&
      response.status() === 200,
  );
  await page.goto(
    `${BASE_URL}/repo/${owner}/${repo}/agent-loops/knowledge-system-refresh`,
    { waitUntil: "domcontentloaded" },
  );
  await Promise.all([definitionsResponse, statesResponse]);

  await expect(page.getByRole("heading", { name: "Loops" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "knowledge-system-refresh" }),
  ).toBeVisible();
  await expect(page.getByText("Operation", { exact: true })).toBeVisible();
  await expect(page.getByText("Workflow refresh-knowledge-system")).toBeVisible();
  await expect(page.getByText("build-knowledge-graph")).toBeVisible();
  await expect(page.getByText("create-knowledge-report")).toBeVisible();
  await expect(page.getByText("publish-knowledge-system")).toBeVisible();

  const pause = page.getByRole("button", { name: "Pause" });
  if (await pause.isVisible()) {
    await expect(pause).toBeEnabled();
  }

  await page.goto(
    `${BASE_URL}/repo/${owner}/${repo}/agent-goals/knowledge-system-current`,
    { waitUntil: "domcontentloaded" },
  );
  await expect(
    page.getByRole("heading", { name: "knowledge-system-current" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Current state" })).toBeVisible();
  await expect(page.getByText("progress", { exact: true })).toBeVisible();

  const bundleResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/kody/knowledge-system") &&
      response.status() === 200,
  );
  await page.goto(
    `${BASE_URL}/repo/${owner}/${repo}/knowledge-system`,
    { waitUntil: "domcontentloaded" },
  );
  await bundleResponse;
  await expect(
    page.getByRole("heading", { name: "Knowledge System" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Repository knowledge graph" }),
  ).toBeVisible();
  await expect(page.getByText("No graph published yet")).toHaveCount(0);
  await expect(page.locator(".react-flow__node").first()).toBeVisible({
    timeout: 30_000,
  });

  await page.goto(`${BASE_URL}/repo/${owner}/${repo}/agency-runs`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { name: "Agency Runs" })).toBeVisible();
  await page.getByRole("button").filter({ hasText: "Workflows" }).click();
  await expect(page.getByText("Refresh Knowledge System").first()).toBeVisible();
  await expect(page.getByText("success", { exact: true }).first()).toBeVisible();
});

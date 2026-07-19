import { expect, test, type Page } from "@playwright/test";

const githubToken = process.env.E2E_GITHUB_TOKEN;
const githubRepo = process.env.E2E_GITHUB_REPO;
const repoParts = githubRepo?.match(/(?:github\.com\/)?([^/]+)\/([^/]+?)(?:\.git)?$/);

test.skip(
  !githubToken || !repoParts,
  "Requires E2E_GITHUB_TOKEN and E2E_GITHUB_REPO for real GuidedFlow verification",
);

const auth = {
  repoUrl: `https://github.com/${repoParts?.[1]}/${repoParts?.[2]}`,
  owner: repoParts?.[1] ?? "",
  repo: repoParts?.[2] ?? "",
  token: githubToken ?? "",
  user: {
    login: "",
    avatar_url: "https://github.com/github-mark.png",
    id: 0,
  },
  loggedInAt: Date.now(),
};

test("loads User Journeys from the real local backend", async ({ page }) => {
  await page.addInitScript((value) => {
    window.localStorage.setItem("kody_auth", JSON.stringify(value));
  }, auth);

  const failures: string[] = [];
  page.on("response", (response) => {
    if (
      response.url().includes("/api/kody/user-journeys") &&
      response.status() >= 400
    ) {
      failures.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto(
    `/repo/${repoParts?.[1]}/${repoParts?.[2]}/user-journeys`,
    { waitUntil: "domcontentloaded" },
  );
  await expect(page.getByRole("heading", { name: "User Journeys" })).toBeVisible();
  await expect(
    page.locator('[role="alert"]').filter({ hasText: /\S/ }),
  ).toHaveCount(0);
  expect(failures).toEqual([]);
});

async function cancelActiveGuidedFlows(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const stored = JSON.parse(localStorage.getItem("kody_auth") ?? "null") as {
      token?: string;
      owner?: string;
      repo?: string;
    } | null;
    if (!stored?.token || !stored.owner || !stored.repo) return;
    const headers = {
      "x-kody-token": stored.token,
      "x-kody-owner": stored.owner,
      "x-kody-repo": stored.repo,
    };
    const list = await fetch("/api/kody/guided-flows", { headers });
    if (!list.ok) throw new Error(`GuidedFlow cleanup list failed: ${list.status}`);
    const payload = (await list.json()) as {
      flows?: Array<{
        instance: { instanceId: string; flowId: string; revision: number; status: string };
      }>;
    };
    for (const flow of payload.flows ?? []) {
      if (
        !["create-workflow", "client-signin"].includes(flow.instance.flowId) ||
        flow.instance.status !== "active"
      ) continue;
      const response = await fetch("/api/kody/guided-flows", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({
          action: "cancel",
          instanceId: flow.instance.instanceId,
          expectedRevision: flow.instance.revision,
          mutationId: `real-e2e-cleanup-${flow.instance.instanceId}-${Date.now()}`,
        }),
      });
      if (!response.ok) throw new Error(`GuidedFlow cleanup failed: ${response.status}`);
    }
  });
}

test("completes the real GuidedFlow form transition and cancels from review", async ({
  page,
}) => {
  const guidedPosts: Array<Record<string, unknown>> = [];
  const guidedFailures: string[] = [];
  page.on("request", (request) => {
    if (
      request.url().includes("/api/kody/guided-flows") &&
      request.method() === "POST"
    ) {
      guidedPosts.push(request.postDataJSON() as Record<string, unknown>);
    }
  });
  page.on("response", (response) => {
    if (
      response.url().includes("/api/kody/guided-flows") &&
      response.status() >= 400
    ) {
      guidedFailures.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.addInitScript((value) => {
    window.localStorage.setItem("kody_auth", JSON.stringify(value));
  }, auth);
  await page.goto("/guided-flows", { waitUntil: "domcontentloaded" });
  await cancelActiveGuidedFlows(page);
  await page.reload();
  await expect(page.getByText("Global chat — not tied to any task", { exact: true })).toBeVisible();


  const startSection = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Start a Guided Flow" }) });
  await expect(startSection).toHaveCount(1);
  const createCard = startSection
    .locator("article")
    .filter({ hasText: "Create a workflow" });
  await expect(createCard).toHaveCount(1);
  await createCard.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/guided-flows$/);
  await expect(page.getByLabel("Workflow name")).toBeVisible();
  await page.getByLabel("Workflow name").fill("Real nightly checks");
  await page.getByLabel("Capability slug").fill("run-tests");
  await page.getByRole("button", { name: "Review workflow" }).click();

  expect(guidedPosts).toContainEqual(
    expect.objectContaining({
      action: "submit",
      actionId: "submit",
      result: {
        workflowName: "Real nightly checks",
        capabilitySlug: "run-tests",
      },
    }),
  );
  await expect(page.getByText("Create this workflow?")).toBeVisible();

  await page.goto("/guided-flows", { waitUntil: "domcontentloaded" });
  const activeCard = page
    .locator("article")
    .filter({ hasText: "In progress · Step 2 of 2" });
  await expect(activeCard).toHaveCount(1);
  await activeCard.getByRole("button", { name: "Resume in chat" }).click();
  await expect(page).toHaveURL(/\/guided-flows$/);
  await expect(page.getByText("Create this workflow?")).toBeVisible();

  const cancel = activeCard.getByRole("button", { name: "Cancel", exact: true });
  await expect(cancel).toHaveCount(1);
  await cancel.click();
  await expect(page.getByText("No active Guided Flows")).toBeVisible();
  expect(guidedFailures).toEqual([]);
});

test("shows flow status in a new chat and resumes only after explicit action", async ({
  page,
}) => {
  await page.addInitScript((value) => {
    window.localStorage.setItem("kody_auth", JSON.stringify(value));
  }, auth);
  await page.goto("/guided-flows", { waitUntil: "domcontentloaded" });
  await cancelActiveGuidedFlows(page);
  await page.reload();

  const startSection = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Start a Guided Flow" }) });
  const createCard = startSection
    .locator("article")
    .filter({ hasText: "Create a workflow" });
  await expect(createCard).toHaveCount(1);
  await createCard.getByRole("button", { name: "Start", exact: true }).click();

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Hi! I can help you with:")).toBeVisible();
  await expect(page.getByText("You have an unfinished GuidedFlow.")).toBeVisible();
  await expect(page.getByText("Create a workflow · Step 1 of 2")).toBeVisible();
  await expect(page.getByLabel("Workflow name")).toHaveCount(0);

  const dashboardUrl = page.url();
  await page.getByRole("button", { name: "Resume flow", exact: true }).click();
  await expect(page).toHaveURL(dashboardUrl);
  await expect(page.getByLabel("Workflow name")).toBeVisible();

  await page.goto("/guided-flows", { waitUntil: "domcontentloaded" });
  const activeCard = page
    .locator("article")
    .filter({ hasText: "Create a workflow" })
    .filter({ hasText: "In progress" });
  await expect(activeCard).toHaveCount(1);
  await cancelActiveGuidedFlows(page);
  await page.reload();
  await expect(page.getByText("No active Guided Flows")).toBeVisible();
});

import { expect, resolveLiveGitHubUser, test, type Page } from "./live-test";

const BASE_URL = process.env.BASE_URL ?? "";
const EXECUTION_BASE_URL =
  process.env.KODY_TRIGGER_EXECUTION_BASE_URL ?? BASE_URL;
const TEST_TOKEN = process.env.E2E_GITHUB_TOKEN ?? "";
const TEST_REPO = process.env.E2E_GITHUB_REPO ?? "";

function parseRepo(value: string) {
  const path = value.includes("://") ? new URL(value).pathname : value;
  const [owner = "", repo = ""] = path.replace(/^\/+|\/+$/g, "").split("/");
  return { owner, repo: repo.replace(/\.git$/i, "") };
}

function apiHeaders(owner: string, repo: string) {
  return {
    "x-kody-token": TEST_TOKEN,
    "x-kody-owner": owner,
    "x-kody-repo": repo,
  };
}

async function installAuth(page: Page, owner: string, repo: string) {
  const user = await resolveLiveGitHubUser(
    page,
    BASE_URL,
    apiHeaders(owner, repo),
  );
  await page.context().addInitScript(
    ({ auth }) => {
      if (!localStorage.getItem("kody_auth")) {
        localStorage.setItem("kody_auth", JSON.stringify(auth));
      }
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
}

test("creates, persists, and executes a GitHub workflow trigger", async ({
  page,
}) => {
  test.setTimeout(180_000);
  test.skip(
    !BASE_URL || !TEST_TOKEN || !TEST_REPO,
    "Requires live repository credentials",
  );

  const { owner, repo } = parseRepo(TEST_REPO);
  const headers = apiHeaders(owner, repo);
  const githubHeaders = {
    authorization: `Bearer ${TEST_TOKEN}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
  const marker = `live-trigger-${Date.now()}`;
  const githubWorkflowsResponse = await page.request.get(
    `${BASE_URL}/api/kody/github/workflows`,
    { headers },
  );
  const workflowDefinitionsResponse = await page.request.get(
    `${BASE_URL}/api/kody/company/workflows`,
    { headers },
  );
  expect(githubWorkflowsResponse.ok()).toBe(true);
  expect(workflowDefinitionsResponse.ok()).toBe(true);
  const githubWorkflows = (await githubWorkflowsResponse.json())
    .workflows as Array<{
    id: number;
    name: string;
  }>;
  const workflowDefinitions = (await workflowDefinitionsResponse.json())
    .workflows as Array<{
    id: string;
    workflow: { name: string };
    runnable?: boolean;
  }>;
  const githubWorkflow = githubWorkflows.find(
    (workflow) => workflow.name === "Test CI",
  );
  const kodyWorkflow = workflowDefinitions.find(
    (workflow) => workflow.workflow.name === "Chore Flow" && workflow.runnable,
  );
  expect(githubWorkflow).toBeTruthy();
  expect(kodyWorkflow).toBeTruthy();

  await installAuth(page, owner, repo);
  // The shared shell requests this optional widget on every repo page. It is
  // not part of the trigger journey and is not installed in the test repo.
  await page.route("**/api/kody/widgets/question-select**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "export default function mount() {}",
    }),
  );

  async function removeTrigger() {
    for (const baseUrl of new Set([BASE_URL, EXECUTION_BASE_URL])) {
      const response = await page.request.delete(
        `${baseUrl}/api/kody/triggers/${marker}`,
        { headers },
      );
      expect([204, 404]).toContain(response.status());
    }
  }

  try {
    await page.goto(`${BASE_URL}/repo/${owner}/${repo}/triggers`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Triggers", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "New trigger", exact: true })
      .click();

    await page.getByRole("combobox", { name: "Trigger" }).click();
    await page
      .getByRole("option", { name: "GitHub workflow finishes" })
      .click();
    await page
      .getByRole("combobox", { name: "GitHub workflow", exact: true })
      .click();
    await page
      .getByRole("option", { name: githubWorkflow!.name, exact: true })
      .click();

    await page.getByRole("combobox", { name: "Action" }).click();
    await page
      .getByRole("option", { name: "Start a Kody workflow", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Kody workflow to start" })
      .click();
    await page
      .getByRole("option", { name: new RegExp(kodyWorkflow!.workflow.name) })
      .click();
    await expect(
      page.getByText("More filters and input mapping (optional)"),
    ).toHaveCount(0);
    await page.getByLabel("Name").fill(marker);
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(
      page.getByText("Trigger saved", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const response = await page.request.get(
          `${BASE_URL}/api/kody/triggers`,
          { headers },
        );
        const body = (await response.json()) as {
          triggers?: Array<{
            id: string;
            event: string;
            action: { type: string; workflowId?: string };
            conditions: Array<{ path: string; value?: unknown }>;
          }>;
        };
        return body.triggers?.find((trigger) => trigger.id === marker) ?? null;
      })
      .toMatchObject({
        id: marker,
        event: "github.workflow_run.completed",
        action: { type: "start-workflow", workflowId: kodyWorkflow!.id },
        conditions: [{ path: "workflowId", value: githubWorkflow!.id }],
      });

    if (EXECUTION_BASE_URL !== BASE_URL) {
      const executionTriggerResponse = await page.request.post(
        `${EXECUTION_BASE_URL}/api/kody/triggers`,
        {
          headers,
          data: {
            trigger: {
              id: marker,
              name: marker,
              enabled: true,
              event: "github.workflow_run.completed",
              conditions: [
                {
                  path: "workflowId",
                  op: "equals",
                  value: githubWorkflow!.id,
                },
              ],
              action: {
                type: "start-workflow",
                workflowId: kodyWorkflow!.id,
                inputMap: {},
              },
            },
          },
        },
      );
      expect(executionTriggerResponse.ok()).toBe(true);
    }

    const dispatchedAfter = Date.now() - 5_000;
    const sourceRunsResponse = await page.request.get(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${githubWorkflow!.id}/runs?per_page=20`,
      { headers: githubHeaders },
    );
    expect(sourceRunsResponse.ok()).toBe(true);
    const sourceRuns = (await sourceRunsResponse.json()) as {
      workflow_runs?: Array<{ id: number; status: string }>;
    };
    const completedSourceRun = sourceRuns.workflow_runs?.find(
      (run) => run.status === "completed",
    );
    expect(completedSourceRun).toBeTruthy();
    const sourceRerunResponse = await page.request.post(
      `https://api.github.com/repos/${owner}/${repo}/actions/runs/${completedSourceRun!.id}/rerun`,
      { headers: githubHeaders },
    );
    expect(sourceRerunResponse.status(), await sourceRerunResponse.text()).toBe(
      201,
    );

    await expect
      .poll(
        async () => {
          const response = await page.request.get(
            `${EXECUTION_BASE_URL}/api/kody/workflow-events?limit=100`,
            { headers },
          );
          if (!response.ok()) return null;
          const body = (await response.json()) as {
            events?: Array<{
              triggerId: string;
              workflowId: string;
              eventName: string;
              status: string;
            }>;
          };
          return (
            body.events?.find((event) => event.triggerId === marker) ?? null
          );
        },
        { timeout: 150_000, intervals: [3_000, 5_000, 10_000] },
      )
      .toMatchObject({
        triggerId: marker,
        workflowId: kodyWorkflow!.id,
        eventName: "github.workflow_run.completed",
        status: "dispatched",
      });

    await expect
      .poll(
        async () => {
          const response = await page.request.get(
            `https://api.github.com/repos/${owner}/${repo}/actions/workflows/kody.yml/runs?event=workflow_dispatch&per_page=20`,
            { headers: githubHeaders },
          );
          if (!response.ok()) return null;
          const body = (await response.json()) as {
            workflow_runs?: Array<{
              id: number;
              created_at: string;
              html_url: string;
            }>;
          };
          return (
            body.workflow_runs?.find(
              (run) => Date.parse(run.created_at) >= dispatchedAfter,
            ) ?? null
          );
        },
        { timeout: 60_000, intervals: [2_000, 5_000] },
      )
      .toMatchObject({ id: expect.any(Number), html_url: expect.any(String) });
  } finally {
    await removeTrigger();
    await expect
      .poll(async () => {
        const response = await page.request.get(
          `${BASE_URL}/api/kody/triggers`,
          { headers },
        );
        const body = (await response.json()) as {
          triggers?: Array<{ id: string }>;
        };
        return body.triggers?.some((trigger) => trigger.id === marker) ?? false;
      })
      .toBe(false);
  }
});

test("replaces the active repository PAT after real GitHub validation", async ({
  page,
}) => {
  test.skip(
    !BASE_URL || !TEST_TOKEN || !TEST_REPO,
    "Requires live repository credentials",
  );

  const { owner, repo } = parseRepo(TEST_REPO);
  await installAuth(page, owner, repo);
  await page.route("**/api/kody/widgets/question-select**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "export default function mount() {}",
    }),
  );

  await page.goto(`${BASE_URL}/repo/${owner}/${repo}/triggers`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTitle("Switch repository").click();
  await page
    .getByRole("button", { name: `Update PAT for ${owner}/${repo}` })
    .click();
  const dialog = page.getByRole("dialog", { name: "Update PAT" });
  await dialog.getByLabel("New personal access token").fill(TEST_TOKEN);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    dialog.getByRole("button", { name: "Save" }).click(),
  ]);

  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("kody_auth") ?? "null"),
  );
  expect(stored).toMatchObject({
    owner,
    repo,
    repos: [expect.objectContaining({ owner, repo })],
  });
  expect(stored.token === TEST_TOKEN).toBe(true);
  expect(stored.repos[0]?.token === TEST_TOKEN).toBe(true);
});

import { expect, resolveLiveGitHubUser, test, type Page } from "./live-test";

const BASE_URL = process.env.BASE_URL ?? "";
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
      },
    },
  );
}

test("creates and persists a GitHub workflow trigger through the live selectors", async ({
  page,
}) => {
  test.setTimeout(180_000);
  test.skip(
    !BASE_URL || !TEST_TOKEN || !TEST_REPO,
    "Requires live repository credentials",
  );

  const { owner, repo } = parseRepo(TEST_REPO);
  const headers = apiHeaders(owner, repo);
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
    const response = await page.request.delete(
      `${BASE_URL}/api/kody/triggers/${marker}`,
      { headers },
    );
    expect([204, 404]).toContain(response.status());
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

    await page.getByRole("combobox", { name: "Event" }).click();
    await page
      .getByRole("option", { name: "github.workflow_run.completed" })
      .click();
    await page
      .getByRole("combobox", { name: "When GitHub workflow finishes" })
      .click();
    await page
      .getByRole("option", { name: githubWorkflow!.name, exact: true })
      .click();

    await page.getByRole("combobox", { name: "Action" }).click();
    await page
      .getByRole("option", { name: "Start Workflow", exact: true })
      .click();
    await page.getByRole("combobox", { name: "Start Kody workflow" }).click();
    await page
      .getByRole("option", { name: new RegExp(kodyWorkflow!.workflow.name) })
      .click();
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

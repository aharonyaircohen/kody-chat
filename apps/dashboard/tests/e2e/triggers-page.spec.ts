import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3333";
const OWNER = "test-owner";
const REPO = "test-repo";

async function seedAuth(page: Page): Promise<void> {
  await page.addInitScript(
    ({ owner, repo }) => {
      localStorage.setItem(
        "kody_auth",
        JSON.stringify({
          repoUrl: `https://github.com/${owner}/${repo}`,
          owner,
          repo,
          token: "ghp_trigger_e2e",
          user: { login: "trigger-e2e", avatar_url: "", id: 1 },
          loggedInAt: Date.now(),
        }),
      );
    },
    { owner: OWNER, repo: REPO },
  );
}

test("user selects the GitHub source workflow and Kody target workflow", async ({
  page,
}) => {
  const errors: string[] = [];
  let savedTrigger: Record<string, unknown> | null = null;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await seedAuth(page);
  await page.route("**/api/kody/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        user: { login: "trigger-e2e", avatar_url: "", githubId: 1 },
        owner: OWNER,
        repo: REPO,
      }),
    }),
  );
  await page.route("**/api/kody/chat/conversations**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ conversations: [] }),
    }),
  );
  const emptyResponses = {
    commands: { commands: [] },
    agents: { agent: [] },
    "guided-flows": { flows: [] },
  } as const;
  for (const path of Object.keys(emptyResponses) as Array<
    keyof typeof emptyResponses
  >) {
    await page.route(`**/api/kody/${path}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyResponses[path]),
      }),
    );
  }
  await page.route("**/api/kody/triggers", async (route) => {
    if (route.request().method() === "POST") {
      savedTrigger = route.request().postDataJSON().trigger;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ triggers: [] }),
    });
  });
  await page.route("**/api/kody/user-state", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        namespaces: [
          { name: "selections", origin: "core", modelWritable: true },
        ],
      }),
    }),
  );
  await page.route("**/api/kody/github/workflows", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        workflows: [
          {
            id: 12,
            name: "Repo Hygiene Report (Daily)",
            path: ".github/workflows/repo-hygiene-report.yml",
            state: "active",
          },
        ],
      }),
    }),
  );
  await page.route("**/api/kody/company/workflows", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        workflows: [
          {
            id: "review-ci",
            workflow: { name: "Review CI" },
            runnable: true,
          },
        ],
      }),
    }),
  );

  await page.goto(`${BASE_URL}/repo/${OWNER}/${REPO}/triggers`);
  await expect(page.getByText("No triggers yet")).toBeVisible();
  await page.getByRole("button", { name: /new trigger/i }).click();

  await page.getByRole("combobox", { name: "Event" }).click();
  await page
    .getByRole("option", { name: "github.workflow_run.completed" })
    .click();
  await expect(
    page.getByRole("combobox", { name: "When GitHub workflow finishes" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "When GitHub workflow finishes" })
    .click();
  await page
    .getByRole("option", { name: "Repo Hygiene Report (Daily)" })
    .click();

  await page.getByRole("combobox", { name: "Action" }).click();
  await page.getByRole("option", { name: "Start Workflow" }).click();
  await page.getByRole("combobox", { name: "Start Kody workflow" }).click();
  await page.getByRole("option", { name: /Review CI/ }).click();

  await page.getByLabel("Name").fill("Start review after hygiene");
  await page.getByRole("button", { name: "Save" }).click();
  await expect
    .poll(() => savedTrigger)
    .toMatchObject({
      event: "github.workflow_run.completed",
      action: {
        type: "start-workflow",
        workflowId: "review-ci",
      },
      conditions: [{ path: "workflowId", op: "equals", value: 12 }],
    });
  expect(errors).toEqual([]);
});

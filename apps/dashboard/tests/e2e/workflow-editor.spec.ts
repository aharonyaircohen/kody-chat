import { test, expect, type Page } from "@playwright/test";

const BASE_URL =
  process.env.PW_LOCAL === "1"
    ? "http://127.0.0.1:3333"
    : (process.env.BASE_URL ?? "http://127.0.0.1:3333");

const fixture = {
  id: "release-readiness",
  path: "workflows/release-readiness/workflow.json",
  source: "local",
  runnable: false,
  workflow: {
    version: 1,
    name: "Release readiness",
    capabilities: ["inspect", "repair", "verify"],
    startAt: "inspect",
    steps: [
      {
        id: "inspect",
        capability: "inspect",
        next: [
          { to: "repair", when: { "facts.needsFix": true } },
          { to: "verify", default: true },
        ],
      },
      { id: "repair", capability: "repair" },
      { id: "verify", capability: "verify" },
    ],
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  },
};

interface WorkflowWriteBody {
  name?: string;
  capabilities?: string[];
  startAt?: string;
  steps?: Array<{
    id?: string;
    capability?: string;
    next?: Array<{
      to?: string;
      when?: Record<string, unknown>;
    }>;
  }>;
}

async function seedAuth(page: Page): Promise<void> {
  await page.goto(BASE_URL + "/login");
  await page.evaluate(() => {
    localStorage.setItem(
      "kody_auth",
      JSON.stringify({
        repoUrl: "https://github.com/test-owner/test-repo",
        owner: "test-owner",
        repo: "test-repo",
        token: "ghp_placeholder",
        user: { login: "workflow-e2e", avatar_url: "", id: 1 },
        loggedInAt: Date.now(),
      }),
    );
  });
}

async function mockWorkflowApis(
  page: Page,
  onWrite: (method: string, body: unknown) => void,
) {
  let currentWorkflow = structuredClone(fixture.workflow);
  await page.route("**/api/kody/company/workflows", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          workflows: [{ ...fixture, workflow: currentWorkflow }],
        }),
      });
      return;
    }
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      onWrite("POST", body);
      currentWorkflow = body as typeof currentWorkflow;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          workflow: {
            ...fixture,
            id: "new-release-flow",
            workflow: currentWorkflow,
          },
        }),
      });
      return;
    }
    await route.fallback();
  });
  await page.route(
    "**/api/kody/company/workflows/release-readiness",
    async (route) => {
      if (route.request().method() === "PATCH") {
        const body = route.request().postDataJSON();
        currentWorkflow = body as typeof currentWorkflow;
        onWrite("PATCH", body);
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            workflow: { ...fixture, workflow: currentWorkflow },
          }),
        });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          workflow: { ...fixture, workflow: currentWorkflow },
        }),
      });
    },
  );
  await page.route(
    "**/api/kody/company/workflows/release-readiness/runs**",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ run: null }),
      });
    },
  );
  await page.route("**/api/kody/capabilities", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        capabilities: [
          { slug: "inspect", describe: "Inspect" },
          { slug: "repair", describe: "Repair" },
          { slug: "verify", describe: "Verify" },
        ],
      }),
    });
  });
  await page.route("**/api/kody/cto/trust", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ capabilities: {}, subjects: {}, log: [] }),
    });
  });
}

test.describe("workflow visual authoring", () => {
  test("lets a user add a step and save a validated workflow edit", async ({
    page,
  }) => {
    const writes: Array<{ method: string; body: WorkflowWriteBody }> = [];
    await seedAuth(page);
    await mockWorkflowApis(page, (method, body) =>
      writes.push({ method, body: body as WorkflowWriteBody }),
    );
    await page.goto(BASE_URL + "/workflows/release-readiness");

    await expect(
      page.getByRole("heading", { name: "Release readiness" }),
    ).toBeVisible();
    await expect(page.getByText("inspect", { exact: true })).toBeVisible();
    await expect(page.getByText("repair", { exact: true })).toBeVisible();
    await expect(page.getByText("verify", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page
      .getByRole("dialog")
      .getByTestId("rf__edge-inspect-repair-0")
      .click();
    await expect(page.getByText("When should this branch run?")).toBeVisible();
    await page
      .getByRole("button", { name: "Use a simple result check" })
      .click();
    await page.getByLabel("When should this branch run?").selectOption("fail");

    await page.getByLabel("Capability to add").selectOption("verify");
    await page.getByRole("button", { name: "Add step" }).click();
    await expect(
      page.getByRole("button", { name: "Remove step verify-2" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Remove step verify-2" }).click();
    await expect(
      page.getByRole("button", { name: "Remove step verify-2" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Add step" }).click();
    await page.getByRole("button", { name: "Save workflow" }).click();

    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]?.method).toBe("PATCH");
    expect(writes[0]?.body.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "inspect",
          next: expect.arrayContaining([
            expect.objectContaining({
              to: "repair",
              when: { "result.status": "fail" },
            }),
          ]),
        }),
        expect.objectContaining({ id: "verify-2", capability: "verify" }),
      ]),
    );
  });

  test("lets a user create a workflow visually", async ({ page }) => {
    const writes: Array<{ method: string; body: WorkflowWriteBody }> = [];
    await seedAuth(page);
    await mockWorkflowApis(page, (method, body) =>
      writes.push({ method, body: body as WorkflowWriteBody }),
    );
    await page.goto(BASE_URL + "/workflows");

    await page.getByRole("button", { name: "New workflow" }).click();
    await page.getByLabel("Workflow name").fill("New release flow");
    await page.getByLabel("Capability to add").selectOption("inspect");
    await page.getByRole("button", { name: "Add step" }).click();
    await page.getByLabel("Capability to add").selectOption("verify");
    await page.getByRole("button", { name: "Add step" }).click();
    await page.getByRole("button", { name: "Create workflow" }).click();

    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]?.method).toBe("POST");
    expect(writes[0]?.body).toMatchObject({
      name: "New release flow",
      capabilities: ["inspect", "verify"],
      startAt: "inspect",
    });
    expect(writes[0]?.body.steps).toHaveLength(2);
  });

  test("keeps an invalid visual workflow unsaved and explains the problem", async ({
    page,
  }) => {
    const writes: Array<{ method: string; body: WorkflowWriteBody }> = [];
    await seedAuth(page);
    await mockWorkflowApis(page, (method, body) =>
      writes.push({ method, body: body as WorkflowWriteBody }),
    );
    await page.goto(BASE_URL + "/workflows");

    await page.getByRole("button", { name: "New workflow" }).click();
    await page.getByLabel("Workflow name").fill("Broken release flow");
    await page.getByLabel("Capability to add").selectOption("inspect");
    await page.getByRole("button", { name: "Add step" }).click();
    await page.getByLabel("Capability to add").selectOption("repair");
    await page.getByRole("button", { name: "Add step" }).click();
    await page.getByLabel("Capability to add").selectOption("verify");
    await page.getByRole("button", { name: "Add step" }).click();
    await page.getByRole("button", { name: "Remove step repair" }).click();
    await page.getByRole("button", { name: "Create workflow" }).click();

    await expect(page.getByRole("alert")).toContainText("verify can never run");
    expect(writes).toHaveLength(0);
  });
});

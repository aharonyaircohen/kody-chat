/**
 * @fileoverview Browser test for the persisted Operation lifecycle.
 * @testFramework playwright
 * @domain agency-operations
 */
import { expect, test, type Route } from "@playwright/test";

const NOW = "2026-07-14T10:00:00.000Z";
const auth = {
  repoUrl: "https://github.com/acme/widgets",
  owner: "acme",
  repo: "widgets",
  token: "e2e-token",
  user: {
    login: "e2e-test",
    avatar_url: "https://github.com/github-mark.png",
    id: 1,
  },
  loggedInAt: Date.now(),
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((value) => {
    window.localStorage.setItem("kody_auth", JSON.stringify(value));
  }, auth);
  await page.route("**/api/kody/auth/me", (route) =>
    json(route, {
      authenticated: true,
      user: {
        login: "e2e-test",
        avatar_url: auth.user.avatar_url,
        githubId: 1,
      },
      owner: "acme",
      repo: "widgets",
    }),
  );
});

test("creates, activates, runs, pauses, retires, and deletes an Operation", async ({
  page,
}) => {
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  const definitions: Array<{
    recordId: string;
    kind: string;
    schemaVersion: number;
    data: Record<string, unknown>;
    createdAt: string;
  }> = [
    {
      recordId: "intent:reliable-delivery:1",
      kind: "intent",
      schemaVersion: 1,
      data: { id: "reliable-delivery" },
      createdAt: NOW,
    },
    {
      recordId: "goal:web-release:1",
      kind: "goal",
      schemaVersion: 1,
      data: {
        id: "web-release",
        operationId: "unassigned",
        objective: {
          desiredState: "Release is live",
          requiredEvidence: [],
          scope: { include: {}, exclude: {} },
        },
        executionRef: { kind: "capability", id: "ship-release" },
      },
      createdAt: NOW,
    },
    {
      recordId: "loop:deployment-health:1",
      kind: "loop",
      schemaVersion: 1,
      data: {
        id: "deployment-health",
        operationId: "unassigned",
        objective: {
          desiredState: "Deployment stays healthy",
          requiredEvidence: [],
          scope: { include: {}, exclude: {} },
        },
        trigger: { type: "schedule", every: "1h" },
        targetRef: { kind: "capability", id: "check-deployment" },
        reconciliationPolicy: {
          overlap: "skip",
          missed: "coalesce",
          failure: {
            maxAttempts: 3,
            backoffSeconds: 30,
            timeoutSeconds: 900,
          },
        },
      },
      createdAt: NOW,
    },
  ];
  const states: Array<{
    definitionId: string;
    kind: string;
    schemaVersion: number;
    data: Record<string, unknown>;
    updatedAt: string;
  }> = [];

  await page.route("**/api/kody/agency-definitions**", (route) =>
    json(route, { definitions }),
  );
  await page.route("**/api/kody/agency-states**", (route) =>
    json(route, { states }),
  );
  await page.route("**/api/kody/agency-model-changes", async (route) => {
    const body = route.request().postDataJSON() as {
      definitions: Array<{ kind: string; definition: Record<string, unknown> }>;
      states: Array<{ kind: string; state: Record<string, unknown> }>;
    };
    requests.push({ method: "POST", path: "/agency-model-changes", body });
    for (const item of body.definitions) {
      const id = String(item.definition.id);
      const existing = definitions.findIndex(
        (record) => record.kind === item.kind && record.data.id === id,
      );
      const record = {
        recordId: `${item.kind}:${id}:${requests.length}`,
        kind: item.kind,
        schemaVersion: 1,
        data: item.definition,
        createdAt: NOW,
      };
      if (existing >= 0) definitions[existing] = record;
      else definitions.push(record);
    }
    for (const item of body.states) {
      const id = String(item.state.definitionId);
      const existing = states.findIndex(
        (record) => record.kind === item.kind && record.definitionId === id,
      );
      const record = {
        definitionId: id,
        kind: item.kind,
        schemaVersion: 1,
        data: item.state,
        updatedAt: NOW,
      };
      if (existing >= 0) states[existing] = record;
      else states.push(record);
    }
    await json(route, {
      created: body.definitions.length,
      reused: 0,
      states: body.states.length,
    });
  });
  await page.route("**/api/kody/operations/*/run", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/kody/operations", "");
    requests.push({ method: request.method(), path, body: null });
    await json(route, {
      ok: true,
      workflowId: "kody.yml",
      ref: "main",
      action: "agency-operations-management",
      operationId: path.split("/")[1],
    });
  });

  await page.goto("/repo/acme/widgets/operations", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { name: "Operations" })).toBeVisible();
  await page.getByRole("button", { name: "New Operation" }).click();

  const form = page.getByRole("dialog");
  await form.getByLabel("Name").fill("Release Operations");
  await form.getByLabel("Responsibility").fill("Ship approved changes safely.");
  await form.getByLabel("Does not own (one per line)").fill("Product priority");
  await form.getByLabel("reliable-delivery").check();
  await form.getByLabel("web-release").check();
  await form.getByLabel("deployment-health").check();
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/kody/agency-model-changes") &&
        response.request().method() === "POST",
    ),
    form.getByRole("button", { name: "Create Operation" }).click(),
  ]);

  await expect(
    page.getByRole("heading", { name: "Release Operations" }),
  ).toBeVisible();
  await expect(page.getByText("ready", { exact: true })).toBeVisible();

  await page
    .getByRole("button", { name: "Activate Operation release-operations" })
    .click();
  await expect(page.getByText("scope valid", { exact: true })).toBeVisible();

  await page
    .getByRole("button", { name: "Run Operation release-operations" })
    .click();
  await expect
    .poll(() => requests.filter((item) => item.path.endsWith("/run")).length)
    .toBe(1);

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("paused", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Retire" }).click();
  await expect(
    page.getByText("retired", { exact: true }).first(),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Delete Operation release-operations" })
    .click();
  const deleteDialog = page.getByRole("dialog");
  await deleteDialog.getByRole("button", { name: "Delete Operation" }).click();
  await expect(page.getByText("No Operations yet")).toBeVisible();

  expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
    "POST /agency-model-changes",
    "POST /agency-model-changes",
    "POST /release-operations/run",
    "POST /agency-model-changes",
    "POST /agency-model-changes",
    "POST /agency-model-changes",
  ]);
});

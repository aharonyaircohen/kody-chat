/**
 * @fileoverview Browser test for the persisted Operation lifecycle.
 * @testFramework playwright
 * @domain agency-operations
 */
import { expect, test, type Page, type Route } from "@playwright/test";

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

type Status = "proposed" | "provisioning" | "active" | "paused" | "retired";
type OperationRecord = {
  id: string;
  path: string;
  activationIssues: string[];
  operation: {
    version: 1;
    id: string;
    name: string;
    responsibility: string;
    doesNotOwn: string[];
    intentIds: string[];
    goals: string[];
    loops: string[];
    status: Status;
    createdAt: string;
    updatedAt: string;
  };
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
  const catalog = {
    intents: ["reliable-delivery"],
    goals: ["web-release"],
    loops: ["deployment-health"],
  };
  let record: OperationRecord | null = null;

  await page.route("**/api/kody/operations**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/kody/operations", "");
    const method = request.method();
    const body = request.postDataJSON?.() ?? null;

    if (method === "GET" && path === "") {
      await json(route, { operations: record ? [record] : [], catalog });
      return;
    }
    requests.push({ method, path, body });

    if (method === "POST" && path === "") {
      const input = body as Omit<
        OperationRecord["operation"],
        "version" | "status" | "createdAt" | "updatedAt"
      >;
      record = {
        id: input.id || "release-operations",
        path: "operations/release-operations/operation.json",
        activationIssues: [],
        operation: {
          version: 1,
          ...input,
          id: input.id || "release-operations",
          status: "proposed",
          createdAt: NOW,
          updatedAt: NOW,
        },
      };
      await json(route, { operation: record }, 201);
      return;
    }
    if (method === "PATCH" && record && path === `/${record.id}`) {
      const patch = body as Partial<OperationRecord["operation"]>;
      record = {
        ...record,
        operation: { ...record.operation, ...patch, updatedAt: NOW },
      };
      await json(route, { operation: record });
      return;
    }
    if (method === "POST" && record && path === `/${record.id}/run`) {
      await json(route, {
        ok: true,
        workflowId: "kody.yml",
        ref: "main",
        action: "agency-operations-management",
        operationId: record.id,
      });
      return;
    }
    if (method === "DELETE" && record && path === `/${record.id}`) {
      record = null;
      await json(route, { success: true });
      return;
    }
    await json(route, { error: "not_found" }, 404);
  });

  await page.goto("/operations", { waitUntil: "domcontentloaded" });
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
        response.url().endsWith("/api/kody/operations") &&
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
    "POST ",
    "PATCH /release-operations",
    "POST /release-operations/run",
    "PATCH /release-operations",
    "PATCH /release-operations",
    "DELETE /release-operations",
  ]);
});

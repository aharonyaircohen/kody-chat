import { expect, test, type Route } from "@playwright/test";

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

const guidedFlowsPath = "/repo/acme/widgets/guided-flows";

async function expectGuidedFlowsPage(page: import("@playwright/test").Page) {
  await expect(
    page.getByRole("heading", { name: "Guided Flows" }),
  ).toBeVisible({ timeout: 30_000 });
}

const activeFlow = {
  instance: {
    instanceId: "flow-active",
    flowId: "create-workflow",
    flowVersion: 1,
    currentStepId: "choose-capability",
    status: "active",
    revision: 0,
    data: {},
    history: [],
  },
  flow: {
    id: "create-workflow",
    title: "Create a workflow",
    stepIndex: 0,
    stepCount: 2,
  },
};

const cancelledFlow = {
  ...activeFlow,
  instance: {
    ...activeFlow.instance,
    instanceId: "flow-cancelled",
    status: "cancelled",
  },
};

const guidedFormView = {
  action: "render_view",
  view: "renderer",
  id: "guided-flow-page-e2e",
  rendererSlug: "guided-form",
  rendererName: "Guided form",
  resultTarget: "guided-flow",
  guidedFlow: {
    instanceId: "flow-started",
    stepId: "choose-capability",
    revision: 0,
  },
  ui: {
    type: "stack",
    children: [
      { type: "text", value: "Create a workflow", variant: "title" },
      { type: "input", name: "workflowName", label: "Workflow name", value: "", readOnly: false },
      { type: "input", name: "capabilitySlug", label: "Capability slug", value: "", readOnly: false },
      { type: "submit", label: "Review workflow" },
    ],
  },
  data: {},
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
      user: { login: "e2e-test", avatar_url: auth.user.avatar_url, githubId: 1 },
    }),
  );
});

test("loads active and history, then cancels an active flow", async ({ page }) => {
  let records = [activeFlow, cancelledFlow];
  const requests: string[] = [];
  await page.route("**/api/kody/guided-flows", async (route) => {
    const request = route.request();
    requests.push(request.method());
    if (request.method() === "GET") {
      await json(route, { flows: records });
      return;
    }
    records = [cancelledFlow];
    await json(route, { instance: { ...activeFlow.instance, status: "cancelled" } });
  });

  await page.goto(guidedFlowsPath, { waitUntil: "domcontentloaded" });
  await expectGuidedFlowsPage(page);
  await expect(page.getByRole("heading", { name: "In progress" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Create a workflow", exact: true }),
  ).toHaveCount(3);
  await expect(page.getByText("Cancelled")).toBeVisible();

  const back = page.getByRole("link", { name: "Back" });
  await expect(back).toHaveCount(1);
  expect(await back.getAttribute("href")).toBe("/repo/acme/widgets");

  const cancel = page.getByRole("button", { name: "Cancel" });
  await expect(cancel).toHaveCount(1);
  await cancel.click();
  await expect(page.getByText("No active Guided Flows")).toBeVisible();
  expect(requests.filter((method) => method === "POST")).toHaveLength(1);
  expect(requests.at(-1)).toBe("GET");
});

test("starts a flow in the already-open chat without navigating", async ({ page }) => {
  await page.route("**/api/kody/guided-flows", async (route) => {
    if (route.request().method() === "GET" && route.request().url().includes("instanceId=")) {
      await json(route, { flow: { ...activeFlow, view: guidedFormView } });
      return;
    }
    if (route.request().method() === "GET") {
      await json(route, {
        flows: [
          {
            ...activeFlow,
            instance: { ...activeFlow.instance, instanceId: "flow-started" },
            view: guidedFormView,
          },
        ],
      });
      return;
    }
    await json(
      route,
      {
        instance: {
          ...activeFlow.instance,
          instanceId: "flow-started",
        },
        view: {},
      },
      201,
    );
  });

  await page.goto(guidedFlowsPath, { waitUntil: "domcontentloaded" });
  await expectGuidedFlowsPage(page);
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
});

test("resumes the selected active flow in the already-open chat without navigating", async ({ page }) => {
  await page.route("**/api/kody/guided-flows", async (route) => {
    if (route.request().url().includes("instanceId=")) {
      await json(route, { flow: { ...activeFlow, view: guidedFormView } });
      return;
    }
    await json(route, { flows: [{ ...activeFlow, view: guidedFormView }] });
  });

  await page.goto(guidedFlowsPath, { waitUntil: "domcontentloaded" });
  await expectGuidedFlowsPage(page);
  await expect(page.getByText("Global chat — not tied to any task", { exact: true })).toBeVisible();
  const activeCard = page
    .locator("article")
    .filter({ hasText: "In progress · Step 1 of 2" });
  await expect(activeCard).toHaveCount(1);
  const resume = activeCard.getByRole("button", { name: "Resume in chat" });
  await expect(resume).toHaveCount(1);
  await resume.click();
  await expect(page).toHaveURL(/\/guided-flows$/);
});

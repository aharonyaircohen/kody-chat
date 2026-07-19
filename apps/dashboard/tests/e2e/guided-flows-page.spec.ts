import { expect, test, type Route } from "@playwright/test";

const auth = {
  repoUrl: "https://github.com/acme/widgets",
  owner: "acme",
  repo: "widgets",
  token: "e2e-token",
  user: { login: "e2e-test", avatar_url: "", id: 1 },
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
  await page.addInitScript(
    (value) => window.localStorage.setItem("kody_auth", JSON.stringify(value)),
    auth,
  );
  await page.route("**/api/kody/auth/me", (route) =>
    json(route, {
      authenticated: true,
      user: { login: "e2e-test", avatar_url: "", githubId: 1 },
    }),
  );
});

test("shows only GuidedFlow templates", async ({ page }) => {
  await page.route("**/api/kody/guided-flows**", (route) =>
    json(route, {
      definitions: [
        {
          id: "create-workflow",
          title: "Create a workflow",
          steps: [{ rendererSlug: "guided-form" }],
        },
      ],
    }),
  );
  await page.goto("/repo/acme/widgets/guided-flows", {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("heading", { name: "Guided Flow Management" }),
  ).toBeVisible();
  await expect(
    page.getByText("Create a workflow", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("In progress", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "History", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start" })).toHaveCount(0);
});

test("creates a GuidedFlow template with an explicit renderer", async ({
  page,
}) => {
  const posts: unknown[] = [];
  await page.route("**/api/kody/guided-flows**", async (route) => {
    if (route.request().method() === "GET") {
      await json(route, { definitions: [] });
      return;
    }
    posts.push(route.request().postDataJSON());
    await json(
      route,
      {
        definition: {
          id: "review-release",
          title: "Review a release",
          steps: [{ rendererSlug: "approval-card" }],
        },
      },
      201,
    );
  });
  await page.goto("/repo/acme/widgets/guided-flows", {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("button", { name: "Add Guided Flow" }).click();
  await page.getByRole("button", { name: "+ Add step" }).click();
  await page.getByLabel("Flow name").fill("Review a release");
  await page.getByLabel("Step 1 title").fill("Confirm the release");
  await page
    .getByLabel("Step 1 explanation")
    .fill("Check the release details.");
  await page.getByLabel("Step 1 renderer").selectOption("approval-card");
  await page.getByRole("button", { name: "Save Guided Flow" }).click();
  await expect(
    page.getByText("Review a release", { exact: true }),
  ).toBeVisible();
  expect(posts).toContainEqual({
    action: "create-definition",
    draft: expect.objectContaining({ title: "Review a release" }),
  });
});

test("manages custom GuidedFlow definitions without editing built-ins", async ({
  page,
}) => {
  const posts: unknown[] = [];
  let customDefinition = {
    id: "review-release",
    title: "Review a release",
    description: "Review the release before publishing.",
    steps: [
      {
        title: "Confirm release",
        explanation: "Check the details.",
        rendererSlug: "approval-card",
      },
    ],
  };

  await page.route("**/api/kody/guided-flows**", async (route) => {
    if (route.request().method() === "GET") {
      await json(route, {
        definitions: [
          {
            id: "create-workflow",
            title: "Create a workflow",
            steps: [{ rendererSlug: "guided-form" }],
          },
          customDefinition,
        ],
      });
      return;
    }

    const body = route.request().postDataJSON() as {
      action: string;
      draft?: { title: string };
      flowId?: string;
    };
    posts.push(body);
    if (body.action === "update-definition") {
      customDefinition = {
        ...customDefinition,
        title: body.draft?.title ?? customDefinition.title,
      };
      await json(route, { definition: customDefinition });
      return;
    }
    if (body.action === "delete-definition") {
      await json(route, { deleted: body.flowId });
      return;
    }
    await json(route, { error: "unexpected_action" }, 400);
  });

  await page.goto("/repo/acme/widgets/guided-flows", {
    waitUntil: "domcontentloaded",
  });
  const builtIn = page.getByRole("article", { name: "Create a workflow" });
  const custom = page.getByRole("article", { name: "Review a release" });
  await expect(builtIn).toBeVisible();
  await expect(custom).toBeVisible();
  await expect(builtIn.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(custom.getByRole("button", { name: "Edit" })).toBeVisible();

  await builtIn.getByRole("button", { name: "View" }).click();
  await expect(
    page.getByRole("dialog", { name: "View Guided Flow" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog").getByLabel("Flow name")).toBeDisabled();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close" })
    .first()
    .click();

  await custom.getByRole("button", { name: "Edit" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit Guided Flow" });
  await editDialog.getByLabel("Flow name").fill("Review a production release");
  await editDialog.getByRole("button", { name: "Save Guided Flow" }).click();
  await expect(
    page.getByRole("article", { name: "Review a production release" }),
  ).toBeVisible();
  expect(posts).toContainEqual({
    action: "update-definition",
    flowId: "review-release",
    draft: expect.objectContaining({ title: "Review a production release" }),
  });

  await page
    .getByRole("article", { name: "Review a production release" })
    .getByRole("button", { name: "Delete" })
    .click();
  const confirmDialog = page.getByRole("dialog", {
    name: "Delete Guided Flow",
  });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole("button", { name: "Delete" }).click();
  await expect(
    page.getByRole("article", { name: "Review a production release" }),
  ).toHaveCount(0);
  expect(posts).toContainEqual({
    action: "delete-definition",
    flowId: "review-release",
  });
});

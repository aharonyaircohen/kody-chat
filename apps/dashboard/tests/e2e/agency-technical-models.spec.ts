/**
 * @fileoverview Browser coverage for Implementation product surfaces backed
 * by the separated Agency model.
 * @testFramework playwright
 * @domain agency-model
 */
import { expect, test, type Page, type Route } from "@playwright/test";

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

async function installHarness(page: Page) {
  await page.addInitScript((value) => {
    window.localStorage.setItem("kody_auth", JSON.stringify(value));
  }, auth);
  await page.route("**/api/kody/auth/me", (route) =>
    json(route, {
      authenticated: true,
      user: {
        login: auth.user.login,
        avatar_url: auth.user.avatar_url,
        githubId: 1,
      },
      owner: auth.owner,
      repo: auth.repo,
    }),
  );
  await page.route("**/api/kody/agency-definitions", (route) =>
    json(route, {
      definitions: [
        {
          recordId: "capability:release-watch:revision-1",
          kind: "capability",
          schemaVersion: 1,
          createdAt: "2026-07-23T00:00:00.000Z",
          data: {
            id: "release-watch",
            action: "release-watch",
            purpose: "Watch release health.",
            inputSchema: { type: "object", properties: {} },
            outputSchema: {
              type: "object",
              properties: { status: { type: "string" } },
            },
            effects: ["comment"],
            permissions: ["gh"],
            success: "Release health is known.",
            failure: "Release health could not be read.",
          },
        },
      ],
    }),
  );
  await page.route("**/api/kody/implementations?*", (route) => {
    if (route.request().method() === "POST") {
      return json(route, { implementation: { id: "new-implementation" } }, 201);
    }
    return json(route, {
      implementations: [
        {
          id: "release-watch-agent",
          capabilityId: "release-watch",
          compatibleCapabilityRevision: "revision-1",
          type: "agent",
          agentId: "kody",
          htmlUrl:
            "https://github.com/acme/store/tree/main/implementations/release-watch-agent",
          selected: true,
          selection: "automatic",
        },
      ],
    });
  });
  await page.route("**/api/kody/implementations/release-watch-agent", (route) => {
    if (route.request().method() === "PATCH") {
      return json(route, { implementation: { id: "release-watch-agent" } });
    }
    if (route.request().method() === "DELETE") {
      return json(route, { success: true });
    }
    return json(route, {
      implementation: {
        id: "release-watch-agent",
        capabilityId: "release-watch",
        compatibleCapabilityRevision: "revision-1",
        type: "agent",
        agentId: "kody",
        htmlUrl:
          "https://github.com/acme/store/tree/main/implementations/release-watch-agent",
        selected: true,
        selection: "automatic",
        repositoryBinding: null,
        definition: {
          id: "release-watch-agent",
          capabilityRef: { kind: "capability", id: "release-watch" },
          compatibleCapabilityRevision: "revision-1",
          type: "agent",
          agentRef: { kind: "agent", id: "kody" },
        },
        runtime: { adapter: "kody-engine-profile" },
        promptTemplate: "Inspect release health.",
        files: ["definition.json", "runtime.json", "prompt.md"],
        assets: {
          skills: ["release-inspection"],
          tools: ["Read"],
          scripts: [],
          hooks: [],
          commands: [],
          subagents: [],
          plugins: [],
          mcpServers: [],
          cliTools: ["gh"],
          inputMappings: [],
          outputMappings: [],
          requirements: [],
        },
        capabilityContract: {
          id: "release-watch",
          action: "release-watch",
          purpose: "Watch release health.",
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
          effects: ["comment"],
          permissions: ["gh"],
          success: "Release health is known.",
          failure: "Release health could not be read.",
        },
        recentRuns: [],
      },
    });
  });
  await page.route("**/api/kody/store-catalog", (route) =>
    json(route, {
      items: [
        {
          slug: "release-watch-agent",
          title: "Release Watch Agent",
          description: "Implements release-watch with an agent runtime.",
          kind: "implementation",
          htmlUrl: null,
          capabilityId: "release-watch",
          compatibleCapabilityRevision: "revision-1",
          implementationType: "agent",
          installed: true,
          selection: "automatic",
          uninstallBlockedBy: [],
        },
      ],
    }),
  );
}

test.beforeEach(async ({ page }) => {
  await installHarness(page);
});

test("shows a standalone Implementation with Store runtime data", async ({
  page,
}) => {
  await page.goto("/repo/acme/widgets/implementations/release-watch-agent", {
    waitUntil: "domcontentloaded",
  });

  await expect(
    page.getByRole("heading", { name: "Implementations" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "release-watch-agent" }),
  ).toBeVisible();
  await expect(page.getByText("Runtime configuration")).toBeVisible();
  await expect(page.getByText("Prompt template")).toBeVisible();
  await expect(page.getByText("Inspect release health.")).toBeVisible();
  await expect(page.getByText("automatic", { exact: true })).toBeVisible();
});

test("shows Implementations as a Store model", async ({ page }) => {
  await page.goto(
    "/repo/acme/widgets/store-catalog/implementation/release-watch-agent?filter=implementation",
    { waitUntil: "domcontentloaded" },
  );

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByTestId(
      "store-catalog-import-implementation-release-watch-agent",
    ),
  ).toContainText("Selected automatically");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(
    page.getByRole("tab", { name: "Implementations" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByTestId(
      "store-catalog-row-implementation-release-watch-agent",
    ),
  ).toBeVisible();
});

test("manages Implementations with the same master-detail pattern", async ({
  page,
}) => {
  await page.goto("/repo/acme/widgets/implementations/release-watch-agent", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByLabel("New implementation")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Edit implementation release-watch-agent",
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add skill" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add MCP" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add script" })).toBeVisible();
  await expect(page.getByLabel("Upload scripts")).toBeAttached();
  await expect(page.getByRole("button", { name: "Edit tools" })).toBeVisible();
  await expect(page.getByLabel("Type")).toHaveCount(0);
  await page.getByLabel("Compatible revision").fill("revision-2");

  const update = page.waitForRequest(
    (request) =>
      request.method() === "PATCH" &&
      request.url().endsWith("/api/kody/implementations/release-watch-agent"),
  );
  await page.getByRole("button", { name: "Update" }).click();
  await update;
  await expect(page.getByText("Implementation saved")).toBeVisible();
});

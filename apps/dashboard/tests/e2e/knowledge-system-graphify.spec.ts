/**
 * @fileoverview Browser contract for the repository-scoped Graphify visualization.
 * @testFramework playwright
 * @domain knowledge-system
 */
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

async function json(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

test("shows the meaningful graph with focused domain views", async ({
  page,
}) => {
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
  await page.route("**/api/kody/knowledge-system", (route) =>
    json(route, {
      bundle: {
        graphUrl: "http://127.0.0.1:3333/knowledge-graph.json",
        htmlUrl: "http://127.0.0.1:3333/knowledge-graph.html",
        reportUrl: null,
        generatedAt: "2026-07-23T10:00:00.000Z",
        nodeCount: 42,
        edgeCount: 84,
      },
    }),
  );
  await page.route("**/knowledge-graph.json", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        nodes: [
          {
            id: "repo:acme/widgets",
            label: "acme/widgets",
            type: "repository",
            domain: "project",
          },
          {
            id: "implementation:review",
            label: "Review implementation",
            type: "implementation",
            domain: "execution",
          },
          {
            id: "agent:kody",
            label: "Kody",
            type: "agent",
            domain: "agency",
          },
          {
            id: "intent:quality",
            label: "Protect product quality",
            type: "intent",
            domain: "business",
          },
          {
            id: "issue:7",
            label: "Broken release",
            type: "issue",
            domain: "work",
          },
          {
            id: "report:health",
            label: "Release health",
            type: "report",
            domain: "quality",
          },
        ],
        edges: [
          {
            source: "repo:acme/widgets",
            target: "agent:kody",
            relation: "has-agent",
          },
          {
            source: "implementation:review",
            target: "agent:kody",
            relation: "run-by",
          },
          {
            source: "intent:quality",
            target: "implementation:review",
            relation: "supported-by",
          },
          {
            source: "agent:kody",
            target: "issue:7",
            relation: "works-on",
          },
          {
            source: "issue:7",
            target: "report:health",
            relation: "measured-by",
          },
        ],
      }),
    }),
  );

  await page.goto("http://127.0.0.1:3333/repo/acme/widgets/knowledge-system", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByTestId("knowledge-graph")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByRole("tab", { name: "Overall", selected: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Purpose", selected: false }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Product" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Work" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Agency" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Evidence" })).toBeVisible();
  await expect(page.getByText("6 entities · 5 areas")).toBeVisible();

  const canvas = page.getByTestId("knowledge-graph-canvas");
  await page.waitForTimeout(1_800);
  const settledFrame = await canvas.screenshot();
  await page.waitForTimeout(700);
  const laterFrame = await canvas.screenshot();
  expect(settledFrame.equals(laterFrame)).toBe(true);

  await page.getByRole("tab", { name: "Work" }).click();
  await expect(page.getByText("3 visible entities")).toBeVisible();
  await expect(page.getByLabel("Find an entity")).toBeVisible();
  await expect(page.getByText(/Community \d+/)).toHaveCount(0);
});

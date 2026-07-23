/**
 * @fileoverview Browser contract for the repository-scoped knowledge graph.
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

test("shows the meaningful interactive knowledge graph", async ({ page }) => {
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
        htmlUrl: null,
        reportUrl: null,
        generatedAt: "2026-07-23T10:00:00.000Z",
        nodeCount: 113,
        edgeCount: 132,
      },
    }),
  );
  await page.route("**/knowledge-graph.json", (route) =>
    json(route, {
      nodes: [
        {
          id: "repo:acme/widgets",
          label: "acme/widgets",
          type: "repository",
          domain: "project",
        },
        {
          id: "goal:ship",
          label: "Ship safely",
          type: "goal",
          domain: "business",
        },
        {
          id: "agent:kody",
          label: "Kody",
          type: "agent",
          domain: "agency",
        },
        {
          id: "issue:7",
          label: "Broken release",
          type: "issue",
          domain: "work",
        },
      ],
      edges: [
        {
          source: "repo:acme/widgets",
          target: "goal:ship",
          relation: "has-goal",
        },
        {
          source: "agent:kody",
          target: "issue:7",
          relation: "works-on",
        },
      ],
    }),
  );

  await page.goto("http://127.0.0.1:3333/repo/acme/widgets/knowledge-system", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByTestId("knowledge-graph")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("knowledge-graph-canvas")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Overall" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Purpose" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Agency" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Work" })).toBeVisible();
  await expect(
    page.getByText("113 nodes · 132 relations", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("4 visible entities")).toBeVisible();
  await expect(page.getByText("Communities")).toHaveCount(0);
});

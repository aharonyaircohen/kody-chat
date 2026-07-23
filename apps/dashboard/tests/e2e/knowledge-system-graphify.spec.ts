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

test("shows Graphify's published visualization directly", async ({ page }) => {
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
  await page.route("**/knowledge-graph.html", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><h1>Graphify knowledge graph</h1>",
    }),
  );

  await page.goto("http://127.0.0.1:3333/repo/acme/widgets/knowledge-system", {
    waitUntil: "domcontentloaded",
  });

  const frame = page.getByTestId("knowledge-graph-frame");
  await expect(frame).toBeVisible();
  await expect(
    page
      .frameLocator('[data-testid="knowledge-graph-frame"]')
      .getByRole("heading", { name: "Graphify knowledge graph" }),
  ).toBeVisible();
  await expect(page.getByText("42 nodes · 84 relations")).toBeVisible();
  await expect(page.getByLabel("Search graph")).toHaveCount(0);
});

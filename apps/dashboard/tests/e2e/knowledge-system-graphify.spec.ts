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

test("shows the meaningful interactive knowledge graph", async ({ page }, testInfo) => {
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
        schemaVersion: 2,
        domains: [
          "company",
          "business",
          "data",
          "technology",
          "work",
          "agency",
        ].map((domain) => ({
          domain,
          graphUrl: `http://127.0.0.1:3333/${domain}-graph.json`,
          generatedAt: "2026-07-23T10:00:00.000Z",
          nodeCount: 1,
          edgeCount: 0,
          status: "ready",
        })),
      },
    }),
  );
  await page.route("**/api/kody/knowledge-system/query", async (route) => {
    const body = route.request().postDataJSON() as {
      overview?: boolean;
    };
    if (body.overview) {
      await json(route, {
        context: {
          subject: null,
          summary: "Knowledge System overview.",
          facts: [],
          relationships: [],
          sources: [],
          gaps: [],
        },
        graph: {
          nodes: [
            "company",
            "business",
            "data",
            "technology",
            "work",
            "agency",
          ].map((domain) => ({
            id: `domain:${domain}`,
            label: domain,
            type: "knowledge_domain",
            domain,
            properties: { entityCount: 1 },
          })),
          edges: [
            {
              source: "domain:company",
              target: "domain:business",
              relation: "connected",
              properties: { relationCount: 1 },
            },
            {
              source: "domain:agency",
              target: "domain:work",
              relation: "connected",
              properties: { relationCount: 1 },
            },
          ],
        },
      });
      return;
    }
    await json(route, {
      context: {
        subject: {
          id: "data:cms:customers",
          label: "Customers",
          type: "collection",
          domain: "data",
        },
        summary: "Stores customer records.",
        facts: [],
        relationships: [],
        sources: [],
        gaps: [],
      },
      graph: {
        nodes: [
          {
            id: "data:cms:customers",
            label: "Customers",
            type: "collection",
            domain: "data",
            sources: [
              {
                kind: "cms",
                id: "cms/config.json#customers",
                resource:
                  "https://github.com/acme/widgets/blob/HEAD/cms/config.json",
              },
            ],
          },
        ],
        edges: [],
      },
    });
  });
  await page.route("**/knowledge-graph.json", (route) =>
    json(route, {
      nodes: [
        {
          id: "company:acme",
          label: "Acme",
          type: "company",
          domain: "company",
          sources: [{ kind: "github", id: "acme" }],
        },
        {
          id: "repo:acme/widgets",
          label: "acme/widgets",
          type: "repository",
          domain: "technology",
          sources: [{ kind: "github", id: "acme/widgets" }],
        },
        {
          id: "goal:ship",
          label: "Ship safely",
          type: "goal",
          domain: "business",
          sources: [{ kind: "kody", id: "goal:ship" }],
        },
        {
          id: "data:cms:customers",
          label: "Customers",
          type: "collection",
          domain: "data",
          sources: [
            {
              kind: "cms",
              id: "cms/config.json#customers",
              resource: "https://github.com/acme/widgets/blob/HEAD/cms/config.json",
            },
          ],
        },
        {
          id: "agent:kody",
          label: "Kody",
          type: "agent",
          domain: "agency",
          sources: [{ kind: "kody", id: "agent:kody" }],
        },
        {
          id: "issue:7",
          label: "Broken release",
          type: "issue",
          domain: "work",
          sources: [{ kind: "github", id: "issue:7" }],
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

  const canvas = page.getByTestId("knowledge-graph-canvas");
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  if (testInfo.project.name === "mobile-chrome") {
    await expect(page.getByLabel("Knowledge layer")).toBeVisible();
  } else {
    await expect(page.getByRole("button", { name: "All layers" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Technology" }),
    ).toBeVisible();
  }
  await expect(
    page.getByText("113 entities · 132 relations", { exact: false }),
  ).toBeVisible();
  if (testInfo.project.name === "mobile-chrome") {
    await page.getByLabel("Knowledge layer").click();
    await page.getByRole("option", { name: "Data" }).click();
  } else {
    await page.getByRole("button", { name: "Data", exact: true }).click();
  }
  await page.getByRole("searchbox", { name: "Find knowledge" }).fill("Customers");
  await page
    .getByRole("button", {
      name: /Customers/,
    })
    .click();
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
  await expect(page.getByText("Source evidence")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /cms · cms\/config\.json#customers/ }),
  ).toHaveAttribute(
    "href",
    "https://github.com/acme/widgets/blob/HEAD/cms/config.json",
  );
  await expect(canvas).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
  await expect(page.getByText("Communities")).toHaveCount(0);
  await expect(page.getByText("Technology graph")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Refresh graph" }),
  ).toHaveCount(0);
  const screenshotPath = testInfo.outputPath("knowledge-system-final.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("knowledge-system-final", {
    path: screenshotPath,
    contentType: "image/png",
  });
});

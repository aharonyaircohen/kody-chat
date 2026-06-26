/**
 * @fileoverview Store Catalog add-reference browser tests.
 * @testFramework playwright
 * @domain e2e
 *
 * Runs the real catalog UI with mocked catalog/import APIs so the browser flow
 * verifies that "Add from Store" links Store models without local copies.
 */

import { expect, test, type Page } from "@playwright/test";

type CatalogKind =
  | "agent"
  | "capability"
  | "agentGoal"
  | "agentLoop"
  | "workflow"
  | "command";

interface CatalogItem {
  slug: string;
  title: string;
  description: string;
  kind: CatalogKind;
  isWorkflow?: boolean;
  workflowSteps?: string[];
  htmlUrl: string | null;
  action?: string | null;
  agent?: string | null;
  schedule?: string | null;
}

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

const catalogSeeds: CatalogItem[] = [
  {
    slug: "atlas-agent",
    title: "Atlas Agent",
    description: "Coordinates product delivery.",
    kind: "agent",
    htmlUrl: null,
  },
  {
    slug: "release-watch",
    title: "Release Watch",
    description: "Keeps release work moving.",
    kind: "capability",
    htmlUrl: null,
    agent: "atlas-agent",
  },
  {
    slug: "bug-flow",
    title: "Bug Flow",
    description: "Reproduces, plans, implements, reviews, and fixes feedback.",
    kind: "capability",
    isWorkflow: true,
    workflowSteps: ["reproduce", "plan", "run", "review", "fix"],
    htmlUrl: null,
    agent: "kody",
  },
  {
    slug: "weekly-quality",
    title: "Weekly Quality",
    description: "Maintains quality goals.",
    kind: "agentGoal",
    htmlUrl: null,
  },
  {
    slug: "daily-triage",
    title: "Daily Triage",
    description: "Repeats triage on a schedule.",
    kind: "agentLoop",
    htmlUrl: null,
    schedule: "1d",
  },
  {
    slug: "release-workflow",
    title: "Release Workflow",
    description: "Runs release readiness capabilities in order.",
    kind: "workflow",
    htmlUrl: null,
  },
  {
    slug: "factory",
    title: "/factory",
    description: "Draft factory changes.",
    kind: "command",
    htmlUrl: null,
  },
];

async function seedAuth(page: Page): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("kody_auth", JSON.stringify(value));
  }, auth);
}

async function mockStoreCatalog(page: Page): Promise<unknown[]> {
  const imports: unknown[] = [];
  await page.route("**/api/kody/store-catalog", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: catalogSeeds,
      }),
    });
  });

  await page.route("**/api/kody/store-catalog/import", async (route) => {
    const body = route.request().postDataJSON() as {
      kind: CatalogKind;
      slug: string;
    };
    imports.push(body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        kind: body.kind,
        slug: body.slug,
        imported: true,
        status: "imported",
        path: `company.active.${body.slug}`,
      }),
    });
  });

  return imports;
}

async function expectNeutralCatalog(page: Page): Promise<void> {
  await expect(
    page.getByText(/^(Active|Not active|Customized|Available)$/),
  ).toHaveCount(0);
}

async function mockIdentity(page: Page): Promise<void> {
  await page.route("**/api/kody/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        user: {
          login: "e2e-test",
          avatar_url: "https://github.com/github-mark.png",
          githubId: 1,
        },
        owner: "acme",
        repo: "widgets",
      }),
    });
  });
}

async function openStoreCatalog(page: Page): Promise<void> {
  await seedAuth(page);
  await mockIdentity(page);
  await page.goto("/store-catalog", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Store Catalog" }),
  ).toBeVisible({ timeout: 10_000 });
}

async function addCatalogItem(
  page: Page,
  item: { kind: CatalogKind; slug: string },
): Promise<void> {
  await page.goto(`/store-catalog/${item.kind}/${item.slug}`, {
    waitUntil: "domcontentloaded",
  });

  const button = page.getByTestId(
    `store-catalog-import-${item.kind}-${item.slug}`,
  );
  await expect(button).toContainText("Add from Store");
  await expectNeutralCatalog(page);
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/kody/store-catalog/import") &&
        response.status() === 200,
    ),
    button.click(),
  ]);
  await expect(button).toContainText("Add from Store");
  await expectNeutralCatalog(page);
}

test.describe("Store Catalog add", () => {
  test("keeps a non-All filter selected from an item route", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "Desktop layout keeps the catalog list visible beside item detail.",
    );

    await mockStoreCatalog(page);
    await openStoreCatalog(page);
    await page.goto("/store-catalog/agent/atlas-agent", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Atlas Agent" }),
    ).toBeVisible();

    const capabilitiesTab = page.getByRole("tab", { name: "Capabilities" });
    await capabilitiesTab.click();

    await expect(capabilitiesTab).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByTestId("store-catalog-row-capability-release-watch"),
    ).toBeVisible();
    await expect(
      page.getByTestId("store-catalog-row-agent-atlas-agent"),
    ).toHaveCount(0);
  });

  test("shows workflow capabilities under the Workflows filter", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "Desktop layout keeps the catalog list visible beside item detail.",
    );

    await mockStoreCatalog(page);
    await openStoreCatalog(page);

    const workflowsTab = page.getByRole("tab", { name: "Workflows" });
    await workflowsTab.click();

    await expect(workflowsTab).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByTestId("store-catalog-row-capability-bug-flow"),
    ).toBeVisible();
    await expect(
      page.getByTestId("store-catalog-row-capability-release-watch"),
    ).toHaveCount(0);

    const capabilitiesTab = page.getByRole("tab", { name: "Capabilities" });
    await capabilitiesTab.click();
    await expect(
      page.getByTestId("store-catalog-row-capability-release-watch"),
    ).toBeVisible();
    await expect(
      page.getByTestId("store-catalog-row-capability-bug-flow"),
    ).toHaveCount(0);
  });

  test("adds every agentic store item type by reference", async ({ page }) => {
    const imports = await mockStoreCatalog(page);

    await openStoreCatalog(page);

    for (const item of catalogSeeds) {
      await addCatalogItem(page, item);
    }

    expect(imports).toEqual([
      { kind: "agent", slug: "atlas-agent" },
      { kind: "capability", slug: "release-watch" },
      { kind: "capability", slug: "bug-flow" },
      { kind: "agentGoal", slug: "weekly-quality" },
      { kind: "agentLoop", slug: "daily-triage" },
      { kind: "workflow", slug: "release-workflow" },
      { kind: "command", slug: "factory" },
    ]);
  });
});

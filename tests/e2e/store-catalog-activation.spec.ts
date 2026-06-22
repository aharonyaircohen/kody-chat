/**
 * @fileoverview Store Catalog activation browser tests.
 * @testFramework playwright
 * @domain e2e
 *
 * Runs the real catalog UI with mocked catalog/config APIs so the add/remove
 * flow is deterministic and does not mutate a live GitHub repo.
 */
import { expect, test, type Page } from "@playwright/test";

type CatalogKind =
  | "agent"
  | "agentAction"
  | "agentResponsibility"
  | "agentGoal"
  | "agentLoop";

type ActiveGoal = string | { template: string };

interface CatalogItem {
  slug: string;
  title: string;
  description: string;
  kind: CatalogKind;
  status: "active" | "not-active";
  active: boolean;
  activatable: boolean;
  source: "store";
  htmlUrl: string | null;
  action?: string | null;
  agent?: string | null;
  agentAction?: string | null;
  capabilityKind?: string | null;
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

const catalogSeeds: Array<Omit<CatalogItem, "active" | "status">> = [
  {
    slug: "atlas-agent",
    title: "Atlas Agent",
    description: "Coordinates product delivery.",
    kind: "agent",
    activatable: true,
    source: "store",
    htmlUrl: null,
  },
  {
    slug: "ship-feature",
    title: "Ship Feature",
    description: "Implements a requested feature.",
    kind: "agentAction",
    activatable: true,
    source: "store",
    htmlUrl: null,
  },
  {
    slug: "release-watch",
    title: "Release Watch",
    description: "Keeps release work moving.",
    kind: "agentResponsibility",
    activatable: true,
    source: "store",
    htmlUrl: null,
    agent: "atlas-agent",
    agentAction: "ship-feature",
    capabilityKind: "act",
  },
  {
    slug: "weekly-quality",
    title: "Weekly Quality",
    description: "Maintains quality goals.",
    kind: "agentGoal",
    activatable: true,
    source: "store",
    htmlUrl: null,
  },
  {
    slug: "daily-triage",
    title: "Daily Triage",
    description: "Repeats triage on a schedule.",
    kind: "agentLoop",
    activatable: true,
    source: "store",
    htmlUrl: null,
    schedule: "1d",
  },
];

function goalSlug(entry: ActiveGoal): string {
  return typeof entry === "string" ? entry : entry.template;
}

async function seedAuth(page: Page): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("kody_auth", JSON.stringify(value));
  }, auth);
}

async function mockStoreCatalog(page: Page): Promise<unknown[]> {
  const patches: unknown[] = [];
  const state = {
    activeAgents: [] as string[],
    activeAgentActions: [] as string[],
    activeAgentResponsibilities: [] as string[],
    activeGoals: [] as ActiveGoal[],
  };

  const items = (): CatalogItem[] =>
    catalogSeeds.map((item) => {
      const active =
        item.kind === "agent"
          ? state.activeAgents.includes(item.slug)
          : item.kind === "agentAction"
            ? state.activeAgentActions.includes(item.slug)
            : item.kind === "agentResponsibility"
              ? state.activeAgentResponsibilities.includes(item.slug)
              : state.activeGoals.some((entry) => goalSlug(entry) === item.slug);
      return {
        ...item,
        active,
        status: active ? "active" : "not-active",
      };
    });

  await page.route("**/api/kody/store-catalog", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: items(),
        ...state,
      }),
    });
  });

  await page.route("**/api/kody/company/config", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state),
      });
      return;
    }

    const body = route.request().postDataJSON() as Partial<typeof state> & {
      actorLogin?: string;
    };
    patches.push(body);

    if (body.activeAgents !== undefined) state.activeAgents = body.activeAgents;
    if (body.activeAgentActions !== undefined) {
      state.activeAgentActions = body.activeAgentActions;
    }
    if (body.activeAgentResponsibilities !== undefined) {
      state.activeAgentResponsibilities = body.activeAgentResponsibilities;
    }
    if (body.activeGoals !== undefined) state.activeGoals = body.activeGoals;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(state),
    });
  });

  return patches;
}

async function openStoreCatalog(page: Page): Promise<void> {
  await seedAuth(page);
  await page.goto("/store-catalog");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: /store catalog/i })).toBeVisible(
    { timeout: 10_000 },
  );
}

async function toggleCatalogItem(
  page: Page,
  item: { kind: CatalogKind; slug: string },
  label: "Add to repo" | "Deactivate",
): Promise<void> {
  await page.getByTestId(`store-catalog-row-${item.kind}-${item.slug}`).click();
  const toggle = page.getByTestId(
    `store-catalog-toggle-${item.kind}-${item.slug}`,
  );
  await expect(toggle).toBeVisible();
  await expect(toggle).toContainText(label);

  const patch = page.waitForResponse(
    (response) =>
      response.url().includes("/api/kody/company/config") &&
      response.request().method() === "PATCH",
  );
  await toggle.click();
  await patch;
  await expect(toggle).toContainText(
    label === "Add to repo" ? "Deactivate" : "Add to repo",
    { timeout: 10_000 },
  );
}

test.describe("Store Catalog activation", () => {
  test("adds and removes every agentic store item type by config reference", async ({
    page,
  }) => {
    const patches = await mockStoreCatalog(page);
    await openStoreCatalog(page);

    await toggleCatalogItem(page, catalogSeeds[0]!, "Add to repo");
    await toggleCatalogItem(page, catalogSeeds[1]!, "Add to repo");
    await toggleCatalogItem(page, catalogSeeds[2]!, "Add to repo");
    await toggleCatalogItem(page, catalogSeeds[3]!, "Add to repo");
    await toggleCatalogItem(page, catalogSeeds[4]!, "Add to repo");

    await toggleCatalogItem(page, catalogSeeds[0]!, "Deactivate");
    await toggleCatalogItem(page, catalogSeeds[1]!, "Deactivate");
    await toggleCatalogItem(page, catalogSeeds[2]!, "Deactivate");
    await toggleCatalogItem(page, catalogSeeds[3]!, "Deactivate");
    await toggleCatalogItem(page, catalogSeeds[4]!, "Deactivate");

    expect(patches).toEqual([
      { activeAgents: ["atlas-agent"], actorLogin: "e2e-test" },
      { activeAgentActions: ["ship-feature"], actorLogin: "e2e-test" },
      {
        activeAgentResponsibilities: ["release-watch"],
        actorLogin: "e2e-test",
      },
      { activeGoals: ["weekly-quality"], actorLogin: "e2e-test" },
      {
        activeGoals: ["weekly-quality", "daily-triage"],
        actorLogin: "e2e-test",
      },
      { activeAgents: [], actorLogin: "e2e-test" },
      { activeAgentActions: [], actorLogin: "e2e-test" },
      { activeAgentResponsibilities: [], actorLogin: "e2e-test" },
      { activeGoals: ["daily-triage"], actorLogin: "e2e-test" },
      { activeGoals: [], actorLogin: "e2e-test" },
    ]);
  });
});

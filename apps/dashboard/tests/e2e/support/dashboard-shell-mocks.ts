import type { Page, Route } from "@playwright/test";

type ShellResponse = Readonly<Record<string, unknown>>;

const SHELL_RESPONSES: Readonly<Record<string, ShellResponse>> = {
  "/api/kody/brain/models": { models: [] },
  "/api/kody/dashboard-config": { config: {} },
  "/api/kody/file-spaces": { spaces: [] },
  "/api/kody/navigation-favorites": { favoriteHrefs: [] },
  "/api/kody/secrets": { secrets: [] },
};

function fulfillJson(route: Route, body: ShellResponse) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

/**
 * Isolates mocked page journeys from persistence used by shared dashboard
 * chrome. Register feature-specific routes after this helper so their own
 * stateful mocks remain authoritative.
 */
export async function mockDashboardShellRequests(page: Page): Promise<void> {
  await Promise.all(
    Object.entries(SHELL_RESPONSES).map(([pathname, response]) =>
      page.route(`**${pathname}`, (route) => fulfillJson(route, response)),
    ),
  );
  await page.route("**/api/kody/chat/machines**", (route) =>
    fulfillJson(route, { local: false }),
  );
}

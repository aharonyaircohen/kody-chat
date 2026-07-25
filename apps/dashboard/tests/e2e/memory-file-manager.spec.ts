import { expect, test, type Page, type Route } from "@playwright/test";

const OWNER = "memory-e2e";
const REPO = "workspace";
const MEMORY_ID = "team-preferences";

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function seedAuth(page: Page) {
  await page.addInitScript(
    ({ owner, repo }) => {
      localStorage.setItem(
        "kody_auth",
        JSON.stringify({
          repoUrl: `https://github.com/${owner}/${repo}`,
          owner,
          repo,
          token: "memory-token",
          user: { login: "memory-e2e", avatar_url: "", id: 1 },
          loggedInAt: Date.now(),
        }),
      );
    },
    { owner: OWNER, repo: REPO },
  );
}

test("Memory uses the shared file workspace and saves markdown", async ({
  page,
}) => {
  const failures: string[] = [];
  let savedBody: string | null = null;
  page.on("pageerror", (error) => failures.push(`page: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) =>
    failures.push(`${request.method()} ${request.url()} failed`),
  );
  await seedAuth(page);

  const memory = {
    id: MEMORY_ID,
    meta: {
      name: "Team preferences",
      description: "How the team prefers to work.",
      type: "project",
      created: "2026-01-01T00:00:00.000Z",
    },
    body: "# Team preferences\n\nKeep changes small.",
    sha: "memory-sha",
    updatedAt: "2026-01-01T00:00:00.000Z",
    htmlUrl: "",
  };

  await page.route("**/api/kody/auth/me", (route) =>
    json(route, {
      authenticated: true,
      user: { login: "memory-e2e", avatar_url: "", githubId: 1 },
      owner: OWNER,
      repo: REPO,
    }),
  );
  await page.route("**/api/kody/memory", (route) =>
    json(route, { memories: [memory] }),
  );
  await page.route(`**/api/kody/memory/${MEMORY_ID}`, async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as { body: string };
      savedBody = body.body;
      memory.body = body.body;
    }
    return json(route, { memory });
  });
  await page.route("**/api/kody/models", (route) =>
    json(route, { models: [] }),
  );
  await page.route("**/api/kody/commands", (route) =>
    json(route, { commands: [] }),
  );
  await page.route("**/api/kody/chat/conversations**", (route) =>
    json(route, { conversations: [], turns: [] }),
  );
  await page.route("**/api/kody/system-events", (route) =>
    json(route, { events: [] }),
  );
  await page.route("**/api/kody/guided-flows", (route) =>
    json(route, { flows: [] }),
  );

  await page.goto(`/repo/${OWNER}/${REPO}/memory`, {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByRole("heading", { name: "Memory" })).toBeVisible();
  await expect(
    page.getByRole("treeitem", { name: /team-preferences\.md/ }),
  ).toBeVisible();
  await page
    .getByRole("treeitem", { name: /team-preferences\.md/ })
    .click();
  await expect(page).toHaveURL(/\/memory\/team-preferences\.md$/);

  const editor = page.getByRole("textbox", { name: "Editor content" });
  await editor.click({ force: true });
  await editor.press("ControlOrMeta+A");
  await editor.press("Backspace");
  await page.keyboard.insertText("# Team preferences\n\nPrefer simple tools.");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect
    .poll(() => savedBody)
    .toContain("Prefer simple tools.");
  expect(failures).toEqual([]);
});

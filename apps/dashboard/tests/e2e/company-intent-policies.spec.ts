import { expect, test, type Route } from "@playwright/test";

const OWNER = "intent-e2e";
const REPO = "workspace";
const NOW = "2026-07-22T00:00:00.000Z";

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

test("selects a reusable policy while controls remain structured", async ({
  page,
}) => {
  const failures: string[] = [];
  let savedInput: Record<string, unknown> | null = null;
  let savedRecord: Record<string, unknown> | null = null;

  page.on("pageerror", (error) => failures.push(`page: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failures.push(`response: ${response.status()} ${response.url()}`);
    }
  });
  await page.addInitScript(
    ({ owner, repo }) => {
      localStorage.setItem(
        "kody_auth",
        JSON.stringify({
          repoUrl: `https://github.com/${owner}/${repo}`,
          owner,
          repo,
          token: "intent-token",
          user: { login: "intent-e2e", avatar_url: "", id: 1 },
          loggedInAt: Date.now(),
        }),
      );
    },
    { owner: OWNER, repo: REPO },
  );

  await page.route("**/api/kody/policies", (route) =>
    json(route, {
      entries: [
        {
          slug: "release-safety",
          body: "Require evidence before release.",
          agent: ["kody"],
          sha: "",
          updatedAt: NOW,
          htmlUrl: "",
        },
      ],
    }),
  );
  await page.route("**/api/kody/company/intents**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET") {
      return json(route, { intents: savedRecord ? [savedRecord] : [] });
    }
    if (request.method() === "POST" && !url.pathname.endsWith("/run")) {
      savedInput = request.postDataJSON() as Record<string, unknown>;
      savedRecord = {
        id: "safe-releases",
        path: "intents/safe-releases/intent.json",
        decisions: [],
        intent: {
          version: 1,
          ...savedInput,
          id: "safe-releases",
          createdAt: NOW,
          updatedAt: NOW,
        },
      };
      return json(route, { intent: savedRecord }, 201);
    }
    return json(route, { error: "not_found" }, 404);
  });
  await page.route("**/api/kody/auth/me", (route) =>
    json(route, {
      authenticated: true,
      user: { login: "intent-e2e", avatar_url: "", githubId: 1 },
      owner: OWNER,
      repo: REPO,
    }),
  );
  await page.route("**/api/kody/chat/conversations**", (route) =>
    json(route, { conversations: [], turns: [] }),
  );
  await page.route("**/api/kody/navigation-favorites", (route) =>
    json(route, { favoriteHrefs: [] }),
  );
  await page.route("**/api/kody/system-events", (route) =>
    json(route, { events: [] }),
  );
  await page.route("**/api/kody/guided-flows", (route) =>
    json(route, { flows: [] }),
  );
  await page.route("**/api/kody/commands", (route) =>
    json(route, { commands: [] }),
  );
  await page.route("**/api/kody/models", (route) =>
    json(route, { models: [] }),
  );

  await page.goto(`/repo/${OWNER}/${REPO}/company-intents`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator('button[aria-label="New intent"]').click();
  const dialog = page.getByRole("dialog", { name: "New intent" });
  await dialog
    .getByPlaceholder("Keep releases healthy without unnecessary work.")
    .fill("Safe releases");
  await dialog.getByText("release-safety", { exact: true }).click();
  await dialog.getByRole("button", { name: "Create" }).click();

  await expect(page.getByText("release-safety", { exact: true })).toBeVisible();
  expect(savedInput).toMatchObject({
    policyRefs: ["release-safety"],
    controls: {
      automation: { authority: "full-auto" },
    },
  });
  expect(savedInput).not.toHaveProperty("policy");
  expect(failures).toEqual([]);
});

import { expect, test, type Page, type Route } from "@playwright/test";

const OWNER = "agency-e2e";
const REPO = "workspace";

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
          token: "agency-token",
          user: {
            login: "agency-e2e",
            avatar_url: "https://github.com/github.png",
            id: 1,
          },
          loggedInAt: Date.now(),
        }),
      );
    },
    { owner: OWNER, repo: REPO },
  );
}

async function mockSharedRequests(page: Page) {
  await page.route("**/api/kody/auth/me", (route) =>
    json(route, {
      authenticated: true,
      user: {
        login: "agency-e2e",
        avatar_url: "https://github.com/github.png",
        githubId: 1,
      },
      owner: OWNER,
      repo: REPO,
    }),
  );
  await page.route("**/api/kody/chat/conversations**", (route) =>
    json(route, { conversations: [], turns: [] }),
  );
}

test("Agency overview edits its single intent from a list row", async ({
  page,
}) => {
  const failures: string[] = [];
  let savedIntent: string | null = null;
  page.on("pageerror", (error) => failures.push(`page: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  await seedAuth(page);
  await mockSharedRequests(page);
  await page.route("**/api/kody/agency", async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as { intent: string };
      savedIntent = body.intent;
      return json(route, {
        agency: { intent: body.intent },
        updatedAt: "2026-07-24T12:00:00.000Z",
      });
    }
    return json(route, {
      agency: { intent: "Ship useful changes safely." },
      updatedAt: "2026-07-23T12:00:00.000Z",
    });
  });

  await page.goto(`/repo/${OWNER}/${REPO}/agency`, {
    waitUntil: "domcontentloaded",
  });

  await expect(
    page.getByRole("heading", { name: "Agency overview" }),
  ).toBeVisible();
  await expect(page.getByText("Ship useful changes safely.")).toBeVisible();
  await page.getByRole("button", { name: "Edit agency intent" }).click();
  const editor = page.getByRole("textbox", { name: "Intent" });
  await editor.fill("Keep the product simple and dependable.");
  await page.getByRole("button", { name: "Save intent" }).click();

  await expect(
    page.getByText("Keep the product simple and dependable."),
  ).toBeVisible();
  await expect
    .poll(() => savedIntent)
    .toBe("Keep the product simple and dependable.");
  expect(failures).toEqual([]);
});

test("Agency overview retries after a load error", async ({ page }) => {
  let attempts = 0;
  await seedAuth(page);
  await mockSharedRequests(page);
  await page.route("**/api/kody/agency", (route) => {
    attempts += 1;
    if (attempts === 1) {
      return json(route, { message: "Temporary failure" }, 500);
    }
    return json(route, {
      agency: { intent: "Recovered intent." },
      updatedAt: null,
    });
  });

  await page.goto(`/repo/${OWNER}/${REPO}/agency`, {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByText("Couldn't load agency")).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Recovered intent.")).toBeVisible();
  expect(attempts).toBe(2);
});

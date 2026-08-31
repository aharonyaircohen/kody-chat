import { expect, test, type Page, type Route } from "@playwright/test";
import { mockDashboardShellRequests } from "./support/dashboard-shell-mocks";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3333";
const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function seedAuth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("kody_auth", JSON.stringify({
      repoUrl: "https://github.com/test-owner/test-repo",
      owner: "test-owner",
      repo: "test-repo",
      token: "ghp_placeholder",
      user: { login: "connections-e2e", avatar_url: "", id: 1 },
      loggedInAt: Date.now(),
    }));
  });
}

test("configures and verifies a Facebook Connection without accepting its token", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await seedAuth(page);
  await mockDashboardShellRequests(page);
  await page.route("**/api/kody/auth/me", (route) =>
    json(route, { authenticated: true, user: { login: "connections-e2e", avatar_url: "", githubId: 1 } }),
  );
  await page.route("https://api.github.com/user", (route) =>
    json(route, { login: "connections-e2e", avatar_url: "", id: 1 }),
  );
  await page.route("**/api/kody/secrets", (route) =>
    json(route, { secrets: [{ name: "FACEBOOK_PAGE_ACCESS_TOKEN" }] }),
  );

  let connection: Record<string, unknown> | null = null;
  let savedBody: Record<string, unknown> | null = null;
  await page.route("**/api/kody/connections", async (route) => {
    if (route.request().method() === "PUT") {
      savedBody = route.request().postDataJSON() as Record<string, unknown>;
      connection = {
        id: savedBody.id,
        name: savedBody.name,
        provider: savedBody.provider,
        accountType: savedBody.accountType,
        externalId: savedBody.externalId,
        credentialRefs: savedBody.credentialRefs,
        status: "needs_attention",
        verifiedAt: null,
      };
      return json(route, { ok: true, connection });
    }
    return json(route, { connections: connection ? [connection] : [] });
  });
  await page.route("**/api/kody/connections/facebook-main/verify", (route) => {
    connection = { ...connection, status: "connected", verifiedAt: "2026-08-31T12:00:00.000Z" };
    return json(route, { ok: true, connection });
  });

  await page.goto(`${BASE_URL}/repo/test-owner/test-repo/connections`);
  await expect(page.getByRole("heading", { name: "Connections" })).toBeVisible();
  const contentGroup = page.getByRole("button", { name: "Content" });
  if ((await contentGroup.getAttribute("aria-expanded")) !== "true") await contentGroup.click();
  await expect(page.getByRole("link", { name: "Connections" })).toHaveAttribute(
    "href", "/repo/test-owner/test-repo/connections",
  );
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.getByText("FACEBOOK_PAGE_ACCESS_TOKEN")).toBeVisible();

  await page.getByRole("textbox", { name: "Name" }).fill("Simulated Reality");
  await page.getByRole("textbox", { name: "Facebook Page ID" }).fill("123456789");
  await page.getByRole("button", { name: "Save Connection" }).click();
  await expect(page.getByText("Connection saved", { exact: true })).toBeVisible();
  expect(savedBody).toEqual({
    id: "facebook-main",
    name: "Simulated Reality",
    provider: "facebook",
    accountType: "page",
    externalId: "123456789",
    credentialRefs: { accessToken: "FACEBOOK_PAGE_ACCESS_TOKEN" },
    actorLogin: "connections-e2e",
  });
  expect(savedBody).not.toHaveProperty("accessToken");
  await page.getByRole("button", { name: "Verify Connection" }).click();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

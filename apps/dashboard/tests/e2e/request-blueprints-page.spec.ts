import { expect, test, type Route } from "@playwright/test";

const auth = {
  repoUrl: "https://github.com/acme/widgets",
  owner: "acme",
  repo: "widgets",
  token: "e2e-token",
  user: { login: "e2e-test", avatar_url: "", id: 1 },
  loggedInAt: Date.now(),
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

test("creates and reloads a Request Blueprint without losing its purpose", async ({ page }) => {
  let saved: Record<string, unknown> | null = null;
  await page.addInitScript(
    (value) => window.localStorage.setItem("kody_auth", JSON.stringify(value)),
    auth,
  );
  await page.route("**/api/kody/auth/me", (route) =>
    json(route, {
      authenticated: true,
      user: { login: "e2e-test", avatar_url: "", githubId: 1 },
    }),
  );
  await page.route("**/api/kody/guided-flows**", async (route) => {
    if (route.request().method() === "GET") {
      return json(route, { definitions: saved ? [saved] : [] });
    }
    const body = route.request().postDataJSON() as { draft: Record<string, unknown> };
    saved = { id: "release-check", version: 1, ...body.draft };
    return json(route, { definition: saved }, 201);
  });

  await page.goto("/repo/acme/widgets/guided-flows", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Request Blueprints" })).toBeVisible();
  await page.getByRole("button", { name: "Add Request Blueprint", exact: true }).click();
  await page.getByLabel("Flow name").fill("Release check");
  await page.getByLabel("Purpose").fill("Release this repository safely and prove production health.");
  await page.getByRole("button", { name: "Save Request Blueprint" }).click();
  await expect(page.getByRole("article", { name: "Release check" })).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  const article = page.getByRole("article", { name: "Release check" });
  await article.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Purpose")).toHaveValue(
    "Release this repository safely and prove production health.",
  );
});

import { expect, test, type Page, type Route } from "@playwright/test";

const OWNER = "aharonyaircohen";
const REPO = "Kody-Engine-Tester";

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
          token: "chat-tools-token",
          user: { login: "chat-tools-e2e", avatar_url: "", id: 1 },
          loggedInAt: Date.now(),
        }),
      );
    },
    { owner: OWNER, repo: REPO },
  );
}

test("manages one useful workflow-published Chat tool", async ({ page }, testInfo) => {
  await seedAuth(page);
  let enabled = false;
  await page.route("**/api/kody/chat-tools**", async (route) => {
    if (route.request().method() === "PATCH") {
      enabled = (route.request().postDataJSON() as { enabled: boolean }).enabled;
      return json(route, { ok: true });
    }
    return json(route, {
      tools: [
        {
          toolId: "company-understanding",
          name: "search_company_knowledge",
          title: "Company knowledge",
          description:
            "Search evidence-backed knowledge about the company, project, repository, data, current work, and AI agency.",
          handlerKind: "knowledge_graph_search",
          sourceWorkflow: "build-chat-knowledge-graph",
          generatedAt: "2026-07-29T10:00:00Z",
          nodeCount: 86,
          edgeCount: 121,
          enabled,
        },
      ],
    });
  });

  await page.goto("/chat-tools");
  await expect(page.getByRole("heading", { name: "Chat Tools" })).toBeVisible();
  await expect(page.getByText("Company knowledge", { exact: true })).toBeVisible();
  await expect(page.getByText("86 facts · 121 links")).toBeVisible();
  await expect(page.getByText("Published tools cannot run uploaded code.")).toBeVisible();

  const toggle = page.getByRole("switch", { name: "Enable Company knowledge" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(
    page.getByRole("switch", { name: "Disable Company knowledge" }),
  ).toHaveAttribute("aria-checked", "true");

  await page.screenshot({
    path: testInfo.outputPath("chat-tools-light.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Dark mode" }).click();
  await expect(page.getByRole("button", { name: "Light mode" })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("chat-tools-dark.png"),
    fullPage: true,
  });
});

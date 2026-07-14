import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3333";
const REPO_KEY = "test-owner/test-repo";
const STORAGE_KEY = `kody-sessions-v3:${REPO_KEY}`;

async function seedLongConversation(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(
    ({ repoKey, storageKey }) => {
      const now = new Date().toISOString();
      const sessionId = "compaction-e2e-session";
      const messages = Array.from({ length: 20 }, (_, index) => ({
        role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
        text:
          (index === 0 ? "OLD_VISIBLE_MARKER " : `message-${index} `) +
          "working context ".repeat(625),
        timestamp: now,
      }));
      localStorage.setItem(
        "kody_auth",
        JSON.stringify({
          repoUrl: "https://github.com/test-owner/test-repo",
          owner: "test-owner",
          repo: "test-repo",
          token: "ghp_placeholder",
          user: { login: "compaction-e2e", avatar_url: "", id: 1 },
          loggedInAt: Date.now(),
        }),
      );
      localStorage.setItem(
        `kody-default-chat-entry:${repoKey}`,
        "kody:test/model",
      );
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          version: 3,
          sessions: [
            {
              id: sessionId,
              title: "Long conversation",
              createdAt: now,
              updatedAt: now,
              messageCount: messages.length,
              agentKey: "kody:test/model",
            },
          ],
          messages: { [sessionId]: messages },
          activeSessionId: sessionId,
        }),
      );
    },
    { repoKey: REPO_KEY, storageKey: STORAGE_KEY },
  );
}

async function selectKodyAgent(page: Page) {
  const chat = page.locator('[aria-label="Kody chat"]');
  const trigger = chat.getByLabel("Chat settings").first();
  await trigger.waitFor({ state: "visible", timeout: 10_000 });
  if (/Kody Test/i.test((await trigger.getAttribute("title")) ?? "")) return;
  await trigger.click();
  const menu = chat
    .locator('details:has(summary[aria-label="Chat settings"])')
    .first();
  await menu.getByRole("button", { name: /Kody Test/i }).click();
  await expect(trigger).toHaveAttribute("title", /Kody Test/i);
  await trigger.click();
}

test("compacts model context while keeping the visible conversation", async ({
  page,
}, testInfo) => {
  await page.route("**/api/kody/models", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        models: [{ id: "test/model", label: "Kody Test", enabled: true }],
      }),
    }),
  );

  let compactCalls = 0;
  let directBody: Record<string, unknown> | null = null;
  await page.route("**/api/kody/chat/compact", async (route) => {
    compactCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ summary: "The earlier working context." }),
    });
  });
  await page.route("**/api/kody/chat/kody", async (route) => {
    directBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body:
        'data: {"type":"text-delta","delta":"Compaction reply"}\n\n' +
        "data: [DONE]\n\n",
    });
  });

  await seedLongConversation(page);
  await page.goto(BASE_URL);
  await page.waitForLoadState("domcontentloaded");

  const chat = page.locator('[aria-label="Kody chat"]');
  const input = chat.locator("textarea").first();
  await expect(input).toBeEditable({ timeout: 15_000 });
  await selectKodyAgent(page);
  await expect(page.getByText(/OLD_VISIBLE_MARKER/).first()).toBeAttached();

  await input.fill("continue after compaction");
  await chat.getByRole("button", { name: "Send message" }).click();

  const status = page.getByTestId("conversation-compaction-status");
  await expect(status).toContainText("Compacting conversation");
  await expect.poll(() => compactCalls).toBe(1);
  await page.screenshot({
    path: testInfo.outputPath("compacting-conversation.png"),
    fullPage: false,
  });
  await expect(status).toContainText("Conversation compacted", {
    timeout: 10_000,
  });
  await expect(page.getByText("Compaction reply").first()).toBeVisible();

  await expect(page.getByText(/OLD_VISIBLE_MARKER/).first()).toBeAttached();
  expect(directBody).toMatchObject({
    conversationSummary: "The earlier working context.",
  });
  expect(JSON.stringify(directBody)).not.toContain("OLD_VISIBLE_MARKER");

  await expect
    .poll(() =>
      page.evaluate((storageKey) => {
        const store = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
        return store.sessions?.[0]?.contextCheckpoint?.summary ?? null;
      }, STORAGE_KEY),
    )
    .toBe("The earlier working context.");
});

test("manually compacts from the composer menu", async ({ page }, testInfo) => {
  await page.route("**/api/kody/models", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        models: [{ id: "test/model", label: "Kody Test", enabled: true }],
      }),
    }),
  );
  let compactCalls = 0;
  await page.route("**/api/kody/chat/compact", async (route) => {
    compactCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ summary: "Manual composer memory." }),
    });
  });

  await seedLongConversation(page);
  await page.goto(BASE_URL);
  await page.waitForLoadState("domcontentloaded");

  const chat = page.locator('[aria-label="Kody chat"]');
  await expect(chat.locator("textarea").first()).toBeEditable({
    timeout: 15_000,
  });
  await selectKodyAgent(page);
  await chat.getByLabel("More compose options").click();
  const compactButton = chat.getByRole("button", {
    name: "Compact conversation",
  });
  await expect(compactButton).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath("composer-compact-menu.png"),
    fullPage: false,
  });
  await compactButton.click();

  const status = page.getByTestId("conversation-compaction-status");
  await expect(status).toContainText("Compacting conversation");
  await expect.poll(() => compactCalls).toBe(1);
  await expect(status).toContainText("Conversation compacted", {
    timeout: 10_000,
  });
  await expect(page.getByText(/OLD_VISIBLE_MARKER/).first()).toBeAttached();
  await expect
    .poll(() =>
      page.evaluate((storageKey) => {
        const store = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
        return store.sessions?.[0]?.contextCheckpoint?.summary ?? null;
      }, STORAGE_KEY),
    )
    .toBe("Manual composer memory.");
});

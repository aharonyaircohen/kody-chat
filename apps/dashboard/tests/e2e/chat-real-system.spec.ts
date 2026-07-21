/**
 * @fileoverview Real-system e2e — exercises the full pipeline:
 *   dashboard UI → /api/kody/chat/trigger → GitHub Actions (kody.yml) →
 *   @kody-ade/kody-engine kody chat → LLM → events persisted →
 *   SSE stream → UI render.
 *
 * @testFramework playwright
 * @domain e2e-real
 *
 * Gated by RUN_REAL_E2E=1 because each test takes 60–120 s and uses real
 * GitHub Actions minutes + provider tokens. Intended for nightly CI.
 *
 * Required env:
 *   BASE_URL             Deployed dashboard (SSO must be off)
 *   E2E_GITHUB_TOKEN     PAT with `repo` + `workflow` for the target repo
 *   E2E_GITHUB_REPO      Full URL, e.g. https://github.com/<owner>/<repo>
 *   E2E_CHAT_MODEL       Optional, e.g. minimax/MiniMax-M3
 */

import { expect, resolveLiveGitHubUser, test, type Page } from "./live-test";

const BASE_URL = process.env.BASE_URL ?? "";
const CONVEX_URL =
  process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL ?? "";
const TEST_TOKEN = process.env.E2E_GITHUB_TOKEN ?? "";
const TEST_REPO = process.env.E2E_GITHUB_REPO ?? "";
const RUN_REAL = process.env.RUN_REAL_E2E === "1";

function parseRepo(url: string): { owner: string; repo: string } {
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/^\//, "").split("/").filter(Boolean);
    return { owner: parts[0] ?? "", repo: parts[1] ?? "" };
  } catch {
    return { owner: "", repo: "" };
  }
}

async function injectAuth(page: Page): Promise<void> {
  const { owner, repo } = parseRepo(TEST_REPO);
  const user = await resolveLiveGitHubUser(page, BASE_URL, {
    "x-kody-token": TEST_TOKEN,
    "x-kody-owner": owner,
    "x-kody-repo": repo,
  });
  await page.context().addInitScript(
    (auth) => {
      localStorage.clear();
      localStorage.setItem("kody_auth", JSON.stringify(auth));
    },
    {
      repoUrl: TEST_REPO,
      owner,
      repo,
      token: TEST_TOKEN,
      user,
      loggedInAt: Date.now(),
    },
  );
}

test.describe("Real chat flow @real", () => {
  test.skip(!RUN_REAL, "set RUN_REAL_E2E=1 to enable real-system chat e2e");
  test.setTimeout(360_000);

  test.beforeAll(() => {
    if (!BASE_URL || !TEST_TOKEN || !TEST_REPO) {
      test.skip(true, "BASE_URL / E2E_GITHUB_TOKEN / E2E_GITHUB_REPO required");
    }
    if (!CONVEX_URL)
      test.skip(
        true,
        "NEXT_PUBLIC_CONVEX_URL / CONVEX_URL required to read chat events",
      );
  });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page);
  });

  test("UI send → engine reply committed to target repo within 2 min", async ({
    page,
  }) => {
    const { owner, repo } = parseRepo(TEST_REPO);
    await page.goto(`${BASE_URL}/repo/${owner}/${repo}`);
    await page.waitForLoadState("domcontentloaded");

    const viewport = await page.viewportSize();
    if ((viewport?.width ?? 1280) < 768)
      test.skip(true, "chat hidden on mobile");

    // Capture what the browser actually requests so we can distinguish
    // server-side failures from client-side bugs (EventSource auth, bundle
    // cache, etc.).
    // Chat events now arrive over the Convex live transport (WebSocket to
    // the Convex deployment), not an /events/stream SSE route — track the
    // websocket for diagnostics instead.
    const liveSockets: string[] = [];
    page.on("websocket", (ws) => {
      if (ws.url().includes("convex")) liveSockets.push(ws.url());
    });

    const chat = page.locator('[aria-label="Kody chat"]');
    const stop = chat.getByRole("button", { name: "Stop run" });
    if (await stop.isVisible()) await stop.click();
    const newConversation = page.getByRole("button", {
      name: "New conversation",
    });
    await expect(newConversation).toBeEnabled({ timeout: 15_000 });
    await newConversation.click();

    // A new conversation restores the configured default model. Select the
    // live Fly runner afterwards so the test exercises the option available
    // to users in the current model catalog.
    const modelPicker = chat.getByRole("button", { name: "Model" }).first();
    await modelPicker.click();
    await chat
      .locator('[role="listbox"]:visible')
      .first()
      .getByRole("option", { name: /^Kody Live \(Fly\)/ })
      .click();
    await expect(modelPicker).toContainText("Kody Live (Fly)");

    const input = chat.locator("textarea").first();
    await expect(input).toBeVisible({ timeout: 15_000 });
    await expect(input).toBeDisabled();

    const marker = `RE2E-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    const startPromise = page.waitForRequest(
      "**/api/kody/chat/interactive/start-fly",
    );
    const bootRunner = chat.getByRole("button", { name: "Boot runner" });
    await expect(bootRunner).toBeVisible({ timeout: 20_000 });
    await bootRunner.click();
    const startReq = await startPromise;
    const startBody = JSON.parse(startReq.postData() ?? "{}") as {
      taskId?: string;
    };
    const sessionId = startBody.taskId;
    expect(
      sessionId,
      "UI must send a taskId to /interactive/start-fly",
    ).toBeTruthy();

    await expect(
      page.getByLabel("Live runner: ready"),
      "runner must visibly become ready",
    ).toBeVisible({ timeout: 180_000 });
    await expect(input).toBeEnabled();
    await input.fill(`Reply with exactly "pong ${marker}" and nothing else.`);
    const appendPromise = page.waitForRequest(
      "**/api/kody/chat/interactive/append",
    );
    await chat.getByRole("button", { name: "Send message" }).click();
    await appendPromise;

    // Phase 1 — engine-side ground truth: read the session's chat events
    // straight from Convex (chatEvents.since, the deliberately-public query
    // the live transport subscribes to — the /events/poll route was removed
    // with the polling fallback). If this fails, the server pipeline is
    // broken (dispatch / workflow / kody / events ingest).
    const deadline = Date.now() + 150_000;

    let markerFound = false;
    while (Date.now() < deadline) {
      const res = await fetch(`${CONVEX_URL}/api/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: "chatEvents:since",
          args: { tenantId: "global", sessionId, afterSeq: -1 },
          format: "json",
        }),
      });
      if (res.status === 200) {
        const data = (await res.json()) as { status?: string; value?: unknown };
        const body = JSON.stringify(data.value ?? "");
        if (
          data.status === "success" &&
          new RegExp(`pong\\s+${marker}`, "i").test(body)
        ) {
          markerFound = true;
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 5_000));
    }
    expect(
      markerFound,
      `engine did not emit the marker "pong ${marker}" within 2.5min`,
    ).toBe(true);

    // Phase 2 — browser-side render: once the engine has committed the
    // reply, the SSE stream should surface it to the UI within a few
    // seconds. This catches client-side bugs the server side can't (e.g.
    // EventSource dropping auth headers, bundle cache, state bugs).
    const assistantBubble = page
      .locator(".bg-muted")
      .filter({ has: page.locator(".prose") })
      .filter({ hasText: new RegExp(`pong\\s+${marker}`, "i") })
      .first();

    try {
      await expect(assistantBubble).toBeVisible({ timeout: 30_000 });
    } catch (e) {
      const sample =
        liveSockets[0] ?? "<no Convex websocket was opened by the page>";
      throw new Error(
        `engine reply reached Convex but UI never rendered it.\n` +
          `  convex websockets opened: ${liveSockets.length}\n` +
          `  first websocket URL:      ${sample}\n` +
          `  original error:           ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  });
});

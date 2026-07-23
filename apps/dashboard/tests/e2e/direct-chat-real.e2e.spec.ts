import { expect, resolveLiveGitHubUser, test, type Page } from "./live-test";

const BASE_URL = process.env.BASE_URL ?? "";
const TEST_TOKEN = process.env.E2E_GITHUB_TOKEN ?? "";
const TEST_REPO = process.env.E2E_GITHUB_REPO ?? "";

function parseRepo(value: string): { owner: string; repo: string } {
  try {
    const path = value.includes("://") ? new URL(value).pathname : value;
    const [owner = "", repo = ""] = path.replace(/^\//, "").split("/");
    return { owner, repo };
  } catch {
    return { owner: "", repo: "" };
  }
}

async function installAuth(page: Page, owner: string, repo: string) {
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

test.describe("Direct Kody chat — real model and persistence", () => {
  test.skip(
    !BASE_URL || !TEST_TOKEN || !TEST_REPO,
    "Requires explicit live target and repository credentials",
  );

  test("sends a real direct-model turn, persists it, and restores it after reload", async ({
    page,
  }) => {
    test.setTimeout(360_000);
    const { owner, repo } = parseRepo(TEST_REPO);
    expect(owner).toBeTruthy();
    expect(repo).toBeTruthy();
    await installAuth(page, owner, repo);

    const headers = {
      "x-kody-token": TEST_TOKEN,
      "x-kody-owner": owner,
      "x-kody-repo": repo,
    };
    const [modelsResponse, secretsResponse] = await Promise.all([
      page.request.get(`${BASE_URL}/api/kody/models`, { headers }),
      page.request.get(`${BASE_URL}/api/kody/secrets`, { headers }),
    ]);
    expect(modelsResponse.ok()).toBe(true);
    expect(secretsResponse.ok()).toBe(true);
    const models = (await modelsResponse.json()) as {
      models?: Array<{
        id: string;
        label: string;
        apiKeySecret: string;
        enabled?: boolean;
      }>;
    };
    const secrets = (await secretsResponse.json()) as {
      secrets?: Array<{ name: string }>;
    };
    const configuredSecrets = new Set(
      (secrets.secrets ?? []).map((secret) => secret.name),
    );
    const configuredModel = (models.models ?? []).find(
      (model) =>
        model.enabled !== false && configuredSecrets.has(model.apiKeySecret),
    );
    expect(
      configuredModel,
      "an enabled model must have a vault secret",
    ).toBeTruthy();

    let conversationId = "";
    let assistantWriteCount = 0;
    page.on("request", (request) => {
      if (request.method() !== "POST" || !request.url().endsWith("/commands")) {
        return;
      }
      const command = request.postDataJSON() as {
        kind?: string;
        role?: string;
        entryId?: string;
      };
      if (
        (command.kind === "append-message" && command.role === "assistant") ||
        (command.kind === "update-message" &&
          command.entryId?.startsWith("assistant:"))
      ) {
        assistantWriteCount += 1;
      }
    });
    page.on("response", async (response) => {
      if (
        response.request().method() === "POST" &&
        response.url().endsWith("/api/kody/chat/conversations") &&
        response.status() === 201
      ) {
        const body = (await response.json().catch(() => ({}))) as {
          conversationId?: string;
        };
        conversationId = body.conversationId ?? conversationId;
      }
    });

    await page.goto(`${BASE_URL}/repo/${owner}/${repo}`, {
      waitUntil: "domcontentloaded",
    });
    const chat = page.locator('[aria-label="Kody chat"]');
    const stop = chat.getByRole("button", { name: "Stop run" });
    if (await stop.isVisible()) await stop.click();
    const newConversation = chat.getByRole("button", {
      name: "New conversation",
    });
    await expect(newConversation).toBeEnabled({ timeout: 15_000 });
    await newConversation.click();

    const modelPicker = chat.getByRole("button", { name: "Model" }).first();
    await modelPicker.click();
    await chat
      .locator('[role="listbox"]:visible')
      .first()
      .locator('button[role="option"]')
      .filter({ hasText: configuredModel!.label })
      .first()
      .click();
    await expect(modelPicker).toContainText(configuredModel!.label);

    const marker = `DIRECT_E2E_${Date.now()}`;
    const input = chat.locator("textarea").first();
    await expect(input).toBeEnabled({ timeout: 15_000 });
    const attachmentName = `live-note-${Date.now()}.txt`;
    const uploadResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith("/attachments"),
    );
    await chat
      .locator('input[type="file"]')
      .last()
      .setInputFiles({
        name: attachmentName,
        mimeType: "text/plain",
        buffer: Buffer.from(`attachment for ${marker}`),
      });
    const uploadResponse = await uploadResponsePromise;
    expect(uploadResponse.status(), "real attachment upload must succeed").toBe(
      201,
    );
    await expect(
      chat.getByText(attachmentName, { exact: false }),
    ).toBeVisible();
    await input.fill(`Reply with exactly ${marker} and no other text.`);
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith("/api/kody/chat/kody"),
    );
    await chat.getByRole("button", { name: "Send message" }).click();
    const response = await responsePromise;
    expect(response.status(), "real direct chat route must succeed").toBe(200);
    await expect(chat.getByText(marker, { exact: false }).last()).toBeVisible({
      timeout: 240_000,
    });
    await expect
      .poll(() => conversationId, { timeout: 30_000 })
      .not.toHaveLength(0);

    try {
      await expect
        .poll(
          async () => {
            const persistedResponse = await page.request.get(
              `${BASE_URL}/api/kody/chat/conversations/${conversationId}`,
              { headers },
            );
            if (!persistedResponse.ok())
              return { status: persistedResponse.status() };
            const persisted = (await persistedResponse.json()) as {
              conversation?: { runtime?: { kind?: string; modelId?: string } };
              entries?: Array<{
                entry?: {
                  kind?: string;
                  role?: string;
                  content?: string;
                  status?: string;
                };
              }>;
            };
            return {
              status: persistedResponse.status(),
              runtime: persisted.conversation?.runtime,
              assistantPersisted: persisted.entries?.some(
                ({ entry }) =>
                  entry?.kind === "message" &&
                  entry.role === "assistant" &&
                  entry.status === "committed" &&
                  entry.content?.includes(marker),
              ),
              assistantPending: persisted.entries?.some(
                ({ entry }) =>
                  entry?.kind === "message" &&
                  entry.role === "assistant" &&
                  entry.status === "pending",
              ),
            };
          },
          { timeout: 30_000, intervals: [250, 500, 1000] },
        )
        .toMatchObject({
          status: 200,
          runtime: {
            kind: "direct",
            modelId: `kody:${configuredModel!.id}`,
          },
          assistantPersisted: true,
          assistantPending: false,
        });
      expect(assistantWriteCount).toBe(1);

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(
        page
          .locator('[aria-label="Kody chat"]')
          .getByText(marker, { exact: false })
          .last(),
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page
          .locator('[aria-label="Kody chat"]')
          .getByText(attachmentName, { exact: false })
          .last(),
      ).toBeVisible({ timeout: 30_000 });
    } finally {
      if (conversationId) {
        const cleanup = await page.request.delete(
          `${BASE_URL}/api/kody/chat/conversations/${conversationId}`,
          { headers },
        );
        expect(
          cleanup.ok(),
          `live conversation cleanup must succeed (HTTP ${cleanup.status()}: ${await cleanup.text()})`,
        ).toBe(true);
      }
    }
  });
});

import { expect, resolveLiveGitHubUser, test, type Page } from "./live-test";

const githubToken = process.env.E2E_GITHUB_TOKEN;
const githubRepo = process.env.E2E_GITHUB_REPO;
const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3333";
const repoParts = githubRepo?.match(
  /(?:github\.com\/)?([^/]+)\/([^/]+?)(?:\.git)?$/,
);

test.skip(
  !githubToken || !repoParts,
  "Requires GitHub credentials for real verification",
);

function authFor(owner: string, repo: string) {
  return {
    repoUrl: `https://github.com/${owner}/${repo}`,
    owner,
    repo,
    token: githubToken ?? "",
    user: {
      login: "",
      avatar_url: "https://github.com/github-mark.png",
      id: 0,
    },
    loggedInAt: Date.now(),
  };
}

async function installResolvedAuth(page: Page, owner: string, repo: string) {
  const user = await resolveLiveGitHubUser(page, baseUrl, {
    "x-kody-token": githubToken ?? "",
    "x-kody-owner": owner,
    "x-kody-repo": repo,
  });
  await page.context().addInitScript(
    (auth) => {
      localStorage.clear();
      localStorage.setItem("kody_auth", JSON.stringify(auth));
    },
    {
      ...authFor(owner, repo),
      user,
    },
  );
}

test("loads real Guided Flow definitions", async ({ page }) => {
  await installResolvedAuth(page, repoParts?.[1] ?? "", repoParts?.[2] ?? "");

  await page.goto(`/repo/${repoParts?.[1]}/${repoParts?.[2]}/guided-flows`, {
    waitUntil: "domcontentloaded",
  });

  await expect(
    page.getByRole("heading", { name: "Guided Flow Management" }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Create a workflow" }),
  ).toBeVisible();
});

test("creates, completes, persists, and cleans up a real custom flow", async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const owner = repoParts?.[1] ?? "";
  const repo = repoParts?.[2] ?? "";
  const flowTitle = `Release check ${suffix}`;
  const flowId = `release-check-${suffix}`;
  const headers = {
    "x-kody-token": githubToken ?? "",
    "x-kody-owner": owner,
    "x-kody-repo": repo,
  };

  await installResolvedAuth(page, owner, repo);

  try {
    await page.goto(`/repo/${owner}/${repo}/guided-flows`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("button", { name: "Add Guided Flow", exact: true })
      .click();
    await page.getByLabel("Flow name").fill(flowTitle);
    await page
      .getByLabel("Step 1 renderer", { exact: true })
      .selectOption("approval-card");
    await page.getByRole("button", { name: "Save Guided Flow" }).click();
    await expect(page.getByRole("article", { name: flowTitle })).toBeVisible();

    await page.goto(
      `/repo/${owner}/${repo}/guided-flows?guidedFlow=${flowId}&instanceKey=${suffix}`,
      { waitUntil: "domcontentloaded" },
    );
    const openChat = page.getByRole("button", { name: "Open chat" });
    if (await openChat.isVisible()) await openChat.click();
    const finish = page
      .locator('[aria-label="Kody chat"] button:enabled')
      .filter({ hasText: /^Finish$/ })
      .last();
    await expect(finish).toBeVisible();
    await finish.click();
    await expect(page.getByText("GuidedFlow completed.")).toBeVisible();

    const completed = await page.evaluate(async () => {
      const auth = JSON.parse(localStorage.getItem("kody_auth") ?? "{}") as {
        token?: string;
        owner?: string;
        repo?: string;
      };
      const response = await fetch("/api/kody/guided-flows", {
        headers: auth.token
          ? {
              "x-kody-token": auth.token,
              "x-kody-owner": auth.owner ?? "",
              "x-kody-repo": auth.repo ?? "",
            }
          : {},
      });
      return response.json();
    });
    expect(completed.flows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instance: expect.objectContaining({
            flowId,
            status: "completed",
          }),
        }),
      ]),
    );
  } finally {
    const cleanup = await page.request.post(
      `${baseUrl}/api/kody/guided-flows`,
      {
        headers,
        data: { action: "delete-definition", flowId },
      },
    );
    expect(
      cleanup.ok(),
      `Guided Flow definition cleanup must succeed (HTTP ${cleanup.status()})`,
    ).toBe(true);
  }
});

test("real Chat reads the current Guided Flow step and submitted answer", async ({
  page,
}) => {
  test.setTimeout(360_000);
  const owner = repoParts?.[1] ?? "";
  const repo = repoParts?.[2] ?? "";
  const suffix = Date.now().toString(36);
  const flowTitle = `Chat context proof ${suffix}`;
  const currentStepTitle = `Context checkpoint ${suffix}`;
  const flowId = `chat-context-proof-${suffix}`;
  const headers = {
    "x-kody-token": githubToken ?? "",
    "x-kody-owner": owner,
    "x-kody-repo": repo,
  };

  await installResolvedAuth(page, owner, repo);

  const [modelsResponse, secretsResponse] = await Promise.all([
    page.request.get(`${baseUrl}/api/kody/models`, { headers }),
    page.request.get(`${baseUrl}/api/kody/secrets`, { headers }),
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
    "an enabled direct model must be configured",
  ).toBeTruthy();

  try {
    await page.goto(`/repo/${owner}/${repo}/guided-flows`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("button", { name: "Add Guided Flow", exact: true })
      .click();
    await page.getByLabel("Flow name").fill(flowTitle);
    await page.getByLabel("Step 1 title").fill(`Answered checkpoint ${suffix}`);
    await page
      .getByLabel("Step 1 renderer", { exact: true })
      .selectOption("approval-card");
    await page
      .getByLabel("Step 1 instructions")
      .fill("Ask the user to confirm this checkpoint.");
    await page.getByRole("button", { name: "+ Add step" }).click();
    await page.getByLabel("Step 2 title").fill(currentStepTitle);
    await page
      .getByLabel("Step 2 renderer", { exact: true })
      .selectOption("approval-card");
    await page
      .getByLabel("Step 2 instructions")
      .fill("Wait at this checkpoint while the user asks Chat for help.");
    await page.getByRole("button", { name: "Save Guided Flow" }).click();
    await expect(page.getByRole("article", { name: flowTitle })).toBeVisible();

    const startResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith("/api/kody/guided-flows"),
    );
    await page
      .getByRole("button", { name: `Start ${flowTitle} in Chat` })
      .click();
    const startResponse = await startResponsePromise;
    expect([200, 201], "starting the real Guided Flow must succeed").toContain(
      startResponse.status(),
    );
    const startPayload = (await startResponse.json()) as {
      flow?: { id?: string };
      view?: { guidedFlow?: { instanceId?: string } };
    };
    expect(startPayload.flow?.id).toBe(flowId);
    expect(startPayload.view?.guidedFlow?.instanceId).toBeTruthy();
    const chat = page.locator('[aria-label="Kody chat"]');
    const firstStep = chat.getByText(`Answered checkpoint ${suffix}`, {
      exact: false,
    });
    if (!(await firstStep.isVisible())) {
      await chat
        .getByRole("button", {
          name: `${flowTitle} · Step 1 of 2`,
          exact: true,
        })
        .click();
    }
    await expect(firstStep).toBeVisible();
    await chat
      .locator("button:enabled")
      .filter({ hasText: /^Confirm$/ })
      .last()
      .click();
    await expect(
      chat.getByText(currentStepTitle, { exact: false }),
    ).toBeVisible();

    const modelPicker = chat.getByRole("button", { name: "Model" }).first();
    await modelPicker.click();
    await chat
      .locator('[role="listbox"]:visible')
      .first()
      .locator('button[role="option"]')
      .filter({ hasText: configuredModel!.label })
      .first()
      .click();

    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith("/api/kody/chat/kody"),
    );
    const input = chat.locator("textarea").first();
    await input.fill(
      "Call guided_flow_context with no arguments. State the exact current step title and the action submitted on the previous step.",
    );
    await chat.getByRole("button", { name: "Send message" }).click();
    const response = await responsePromise;
    expect(response.status(), "the real direct Chat route must succeed").toBe(
      200,
    );
    await expect(
      chat
        .locator(".prose")
        .filter({ hasText: currentStepTitle })
        .filter({ hasText: /confirm/i })
        .last(),
    ).toBeVisible({ timeout: 240_000 });
  } finally {
    const active = await page.request.get(`${baseUrl}/api/kody/guided-flows`, {
      headers,
    });
    const activePayload = (await active.json().catch(() => null)) as {
      flows?: Array<{
        instance?: {
          flowId?: string;
          instanceId?: string;
          revision?: number;
          status?: string;
        };
      }>;
    } | null;
    for (const candidate of activePayload?.flows ?? []) {
      const instance = candidate.instance;
      if (
        instance?.flowId !== flowId ||
        instance.status !== "active" ||
        !instance.instanceId ||
        typeof instance.revision !== "number"
      ) {
        continue;
      }
      await page.request.post(`${baseUrl}/api/kody/guided-flows`, {
        headers,
        data: {
          action: "cancel",
          instanceId: instance.instanceId,
          expectedRevision: instance.revision,
          mutationId: `e2e-cleanup-${instance.instanceId}`,
        },
      });
    }
    const cleanup = await page.request.post(
      `${baseUrl}/api/kody/guided-flows`,
      {
        headers,
        data: { action: "delete-definition", flowId },
      },
    );
    expect(
      cleanup.ok(),
      `Guided Flow definition cleanup must succeed (HTTP ${cleanup.status()})`,
    ).toBe(true);
  }
});

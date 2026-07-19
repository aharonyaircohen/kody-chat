/**
 * @fileoverview Browser-level repro for Kody chat renderer output.
 * @testFramework playwright
 * @domain e2e-mocked
 *
 * The route is mocked, but the chat rail, SSE parser, rendered-view UI,
 * click handling, and one-click lock all run in the browser.
 */

import { expect, test, type Page, type Route } from "@playwright/test";

const LOCAL_BASE_URL =
  process.env.RENDERER_E2E_BASE_URL ?? "http://127.0.0.1:3344";
const TEST_TOKEN = process.env.E2E_GITHUB_TOKEN ?? "ghp_placeholder";
const TEST_REPO =
  process.env.E2E_GITHUB_REPO ?? "https://github.com/test-owner/test-repo";

function parseRepo(url: string): { owner: string; repo: string } {
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/^\//, "").split("/").filter(Boolean);
    return { owner: parts[0] ?? "test-owner", repo: parts[1] ?? "test-repo" };
  } catch {
    return { owner: "test-owner", repo: "test-repo" };
  }
}

async function injectAuth(
  page: Page,
  options: { defaultChatEntry?: string | null } = {},
): Promise<void> {
  const { owner, repo } = parseRepo(TEST_REPO);
  await page.evaluate(
    ({ auth, owner, repo, defaultChatEntry }) => {
      const repoKey = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
      localStorage.setItem("kody_auth", JSON.stringify(auth));
      if (defaultChatEntry) {
        localStorage.setItem(
          `kody-default-chat-entry:${repoKey}`,
          defaultChatEntry,
        );
      } else {
        localStorage.removeItem(`kody-default-chat-entry:${repoKey}`);
      }
      localStorage.removeItem(`kody-sessions-v3:${repoKey}`);
      localStorage.removeItem("kody-sessions-v3");
    },
    {
      owner,
      repo,
      defaultChatEntry: Object.prototype.hasOwnProperty.call(
        options,
        "defaultChatEntry",
      )
        ? options.defaultChatEntry
        : "kody:chat-model-pro",
      auth: {
        repoUrl: TEST_REPO,
        owner,
        repo,
        token: TEST_TOKEN,
        user: { login: "renderer-e2e", avatar_url: "", id: 1 },
        loggedInAt: Date.now(),
      },
    },
  );
}

function chatRail(page: Page) {
  return page.locator('[aria-label="Kody chat"]');
}

function chatInput(page: Page) {
  return chatRail(page).locator("textarea").first();
}

function sseBody(events: unknown[]): string {
  // A healthy AI SDK UI stream ends with `finish` + `[DONE]`; the transport
  // treats an EOF without them as a dropped connection (kody-direct.ts).
  const withTerminal = [...events, { type: "finish" }];
  return (
    withTerminal.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") +
    "data: [DONE]\n\n"
  );
}

async function mockShellApis(page: Page): Promise<void> {
  await page.route("**/api/kody/tasks*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ tasks: [] }),
    }),
  );
  await page.route("**/api/kody/config*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ config: { defaultPreviewUrl: "" } }),
    }),
  );
  await page.route("**/api/kody/models*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        models: [
          {
            id: "chat-model-pro",
            provider: "example",
            modelName: "chat-model-pro",
            label: "Chat Model Pro",
            apiKeySecret: "MY_API_KEY",
            baseURL: "https://api.example.com/v1/",
            protocol: "openai",
            enabled: true,
          },
        ],
      }),
    }),
  );
  await page.route("**/api/kody/chat/global*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ messages: [] }),
    }),
  );
  await page.route("**/api/kody/chat/global", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    }),
  );
}

function renderedApprovalView(
  overrides: {
    title?: string;
    body?: string;
    bodyType?: "text" | "markdown";
  } = {},
) {
  const title = overrides.title ?? "Confirm this question?";
  const body = overrides.body ?? "Should I continue?";
  const bodyType = overrides.bodyType ?? "text";
  return {
    action: "render_view",
    view: "renderer",
    id: "view-approval-e2e",
    rendererSlug: "decision-fixture",
    rendererName: "Decision",
    resultTarget: "chat",
    ui: {
      type: "stack",
      children: [
        { type: "text", value: title, variant: "title" },
        { type: bodyType, value: body },
        {
          type: "row",
          children: [
            {
              type: "button",
              label: "Approve",
              action: {
                id: "approve",
                label: "Approve",
                response: "approve",
                variant: "primary",
              },
            },
            {
              type: "button",
              label: "Cancel",
              action: { id: "cancel", label: "Cancel", response: "cancel" },
            },
          ],
        },
      ],
    },
    data: {
      title,
      body,
      actions: [
        {
          id: "approve",
          label: "Approve",
          response: "approve",
          variant: "primary",
        },
        { id: "cancel", label: "Cancel", response: "cancel" },
      ],
    },
  };
}

function renderedSelectionView() {
  return {
    action: "render_view",
    view: "renderer",
    id: "view-selection-e2e",
    rendererSlug: "choice-fixture",
    rendererName: "Choice",
    resultTarget: "chat",
    ui: {
      type: "stack",
      children: [
        { type: "text", value: "Choose a report", variant: "title" },
        { type: "text", value: "Pick one report to open." },
        {
          type: "list",
          children: [
            {
              type: "button",
              label: "CTO Report",
              action: { id: "cto", label: "CTO Report", response: "cto" },
            },
            {
              type: "button",
              label: "Kody Health Check",
              action: {
                id: "health",
                label: "Kody Health Check",
                response: "health",
              },
            },
          ],
        },
      ],
    },
    data: {
      title: "Choose a report",
      body: "Pick one report to open.",
      items: [
        { id: "cto", label: "CTO Report", response: "cto" },
        { id: "health", label: "Kody Health Check", response: "health" },
      ],
    },
  };
}

function renderedMultiSelectionView() {
  return {
    action: "render_view",
    view: "renderer",
    id: "view-multi-selection-e2e",
    rendererSlug: "bulk-choice-fixture",
    rendererName: "Bulk choice",
    resultTarget: "chat",
    ui: {
      type: "stack",
      children: [
        { type: "text", value: "Choose reports", variant: "title" },
        { type: "text", value: "Pick every report to open." },
        {
          type: "list",
          children: [
            {
              type: "checkbox",
              name: "selected",
              value: "cto",
              label: "CTO Report",
            },
            {
              type: "checkbox",
              name: "selected",
              value: "health",
              label: "Kody Health Check",
            },
            {
              type: "checkbox",
              name: "selected",
              value: "security",
              label: "Security Audit",
            },
          ],
        },
        { type: "submit", label: "Confirm reports" },
      ],
    },
    data: {
      title: "Choose reports",
      body: "Pick every report to open.",
      items: [
        { id: "cto", label: "CTO Report", response: "cto" },
        { id: "health", label: "Kody Health Check", response: "health" },
        { id: "security", label: "Security Audit", response: "security" },
      ],
    },
  };
}

function guidedFlowView(step: "form" | "review", revision: number) {
  const isForm = step === "form";
  return {
    action: "render_view",
    view: "renderer",
    id: `guided-flow-e2e-${revision}`,
    rendererSlug: isForm ? "guided-form" : "approval-card",
    rendererName: isForm ? "Guided form" : "Approval card",
    resultTarget: "guided-flow",
    guidedFlow: {
      instanceId: "guided-flow-e2e",
      stepId: isForm ? "choose-capability" : "review",
      revision,
    },
    ui: isForm
      ? {
          type: "stack",
          children: [
            { type: "text", value: "Create a workflow", variant: "title" },
            { type: "text", value: "Describe the workflow." },
            {
              type: "input",
              name: "workflowName",
              label: "Workflow name",
              value: "",
              readOnly: false,
            },
            {
              type: "input",
              name: "capabilitySlug",
              label: "Capability slug",
              value: "",
              readOnly: false,
            },
            { type: "submit", label: "Review workflow" },
          ],
        }
      : {
          type: "stack",
          children: [
            { type: "text", value: "Review workflow", variant: "title" },
            { type: "text", value: "Create this workflow?" },
            {
              type: "button",
              label: "Create workflow",
              action: {
                id: "approve",
                label: "Create workflow",
                response: "approve",
                variant: "primary",
              },
            },
          ],
        },
    data: {},
  };
}

async function mockChatStream(
  page: Page,
  options: {
    onRequest?: (body: { messages?: Array<{ content?: string }> }) => void;
    alwaysContent?: string;
  } = {},
): Promise<void> {
  let turn = 0;
  await page.route("**/api/kody/chat/kody", async (route: Route) => {
    turn += 1;
    const body = route.request().postDataJSON() as {
      messages?: Array<{ content?: string }>;
    };
    options.onRequest?.(body);
    const latest = body.messages?.at(-1)?.content ?? "";
    const output =
      options.alwaysContent !== undefined
        ? { content: options.alwaysContent }
        : latest.includes("multiple") && latest.includes("reports")
          ? renderedMultiSelectionView()
          : latest.includes("reports") && latest.includes("select")
            ? renderedSelectionView()
            : turn === 1
              ? renderedApprovalView()
              : { content: "Recorded." };
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
      },
      body: sseBody([
        {
          type: "tool-input-available",
          toolCallId: `tool-${turn}`,
          toolName: output && "action" in output ? "show_view" : "final_answer",
          input:
            output && "action" in output
              ? { purpose: "fixture", data: { title: "Fixture" } }
              : output,
        },
        {
          type: "tool-output-available",
          toolCallId: `tool-${turn}`,
          output,
        },
      ]),
    });
  });
}

async function openChat(
  page: Page,
  options: { defaultChatEntry?: string | null } = {},
): Promise<void> {
  await page.goto(LOCAL_BASE_URL);
  await page.waitForLoadState("domcontentloaded");
  await injectAuth(page, options);
  await page.reload();
  await page.waitForLoadState("domcontentloaded");

  const viewport = await page.viewportSize();
  test.skip((viewport?.width ?? 1280) < 768, "chat rail hidden on mobile");

  await expect(chatInput(page)).toBeEditable({ timeout: 10_000 });
}

async function sendChatMessage(page: Page, text: string): Promise<void> {
  await chatInput(page).fill(text);
  await chatRail(page).getByRole("button", { name: "Send message" }).click();
}

test.describe("Kody chat renderer output", () => {
  test.beforeEach(async ({ page }) => {
    await mockShellApis(page);
    await mockChatStream(page);
  });

  test("approval request renders a card and locks after one click", async ({
    page,
  }) => {
    await openChat(page);

    await sendChatMessage(
      page,
      "aske me a q and ask for approval to confirm it",
    );

    await expect(page.getByText("Confirm this question?")).toBeVisible();
    await expect(page.getByText("Should I continue?")).toBeVisible();
    const approve = page.getByRole("button", { name: "Approve" });
    await expect(approve).toBeVisible();

    await approve.click();
    await expect(approve).toBeDisabled();
  });

  test("rejected final-answer approval prose does not leak before renderer", async ({
    page,
  }) => {
    const leakedQuestion =
      "Also, before I open it — the dashboard Changelog page reads from the repo's CHANGELOG.md. Want me to peek at that file to see what it's actually serving right now, so the issue points to the real cause?";
    await page.unroute("**/api/kody/chat/kody");
    await page.route("**/api/kody/chat/kody", async (route: Route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
        },
        body: sseBody([
          {
            type: "text-delta",
            delta: leakedQuestion,
          },
          {
            type: "tool-input-available",
            toolCallId: "tool-final-answer",
            toolName: "final_answer",
            input: { content: leakedQuestion },
          },
          {
            type: "tool-output-available",
            toolCallId: "tool-final-answer",
            output: {
              error:
                "final_answer requires show_view for this interactive response",
            },
          },
          {
            type: "tool-input-available",
            toolCallId: "tool-show-view",
            toolName: "show_view",
            input: {
              purpose: "approval-card",
              data: { title: "Peek at CHANGELOG.md first?" },
            },
          },
          {
            type: "tool-output-available",
            toolCallId: "tool-show-view",
            output: renderedApprovalView({
              title: "Peek at CHANGELOG.md first?",
              body: "This will make the issue point to the real cause.",
            }),
          },
        ]),
      });
    });
    await openChat(page);

    await sendChatMessage(page, "open a bug for the changelog page");

    await expect(page.getByText("Peek at CHANGELOG.md first?")).toBeVisible();
    await expect(page.getByText(leakedQuestion)).toHaveCount(0);
  });

  test("plain streamed text is rendered without client-side renderer guessing", async ({
    page,
  }) => {
    const plainQuestion = "Want me to file this as a bug now?";
    await page.unroute("**/api/kody/chat/kody");
    await page.route("**/api/kody/chat/kody", async (route: Route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
        },
        body: sseBody([{ type: "text-delta", delta: plainQuestion }]),
      });
    });
    await openChat(page);

    await sendChatMessage(
      page,
      "i want to open new issue, changelog is not properly being populated",
    );

    await expect(page.getByText(plainQuestion)).toBeVisible();
    await expect(page.getByText(/output tool/i)).toHaveCount(0);
  });

  test("approval markdown body renders as formatted content", async ({
    page,
  }) => {
    await page.unroute("**/api/kody/chat/kody");
    await page.route("**/api/kody/chat/kody", async (route: Route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
        },
        body: sseBody([
          {
            type: "tool-input-available",
            toolCallId: "tool-markdown-view",
            toolName: "show_view",
            input: {
              purpose: "approval-card",
              data: { title: "File this bug?" },
            },
          },
          {
            type: "tool-output-available",
            toolCallId: "tool-markdown-view",
            output: renderedApprovalView({
              title: "File this bug?",
              bodyType: "markdown",
              body: "**Title:** Changelog not populated\n\n**Steps to reproduce:**\n1. Open the Changelog page\n2. Scroll to the top\n\n**Expected:** Each release lists merged work.",
            }),
          },
        ]),
      });
    });
    await openChat(page);

    await sendChatMessage(page, "ask approval to file the changelog bug");

    await expect(page.getByText("File this bug?")).toBeVisible();
    await expect(page.getByText("Title:")).toBeVisible();
    await expect(page.getByText("Open the Changelog page")).toBeVisible();
    await expect(page.getByText("**Title:**")).toHaveCount(0);
  });

  test("report selection request renders a selectable list and locks after one click", async ({
    page,
  }) => {
    await openChat(page);

    await sendChatMessage(page, "list all reports allow me to select one");

    await expect(page.getByText("Choose a report")).toBeVisible();
    const cto = page.getByRole("button", { name: "CTO Report" });
    await expect(cto).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Kody Health Check" }),
    ).toBeVisible();

    await cto.click();
    await expect(cto).toBeDisabled();
  });

  test("multi-selection request uses checkbox and submit atoms then locks", async ({
    page,
  }) => {
    await openChat(page);

    await sendChatMessage(page, "let me select multiple reports");

    await expect(page.getByText("Choose reports")).toBeVisible();
    const cto = page.getByRole("checkbox", { name: "CTO Report" });
    const health = page.getByRole("checkbox", { name: "Kody Health Check" });
    const security = page.getByRole("checkbox", { name: "Security Audit" });
    const confirm = page.getByRole("button", { name: "Confirm reports" });

    await expect(cto).toBeVisible();
    await cto.click();
    await health.click();

    await expect(cto).toBeChecked();
    await expect(health).toBeChecked();
    await expect(security).not.toBeChecked();

    await confirm.click();

    await expect(confirm).toBeDisabled();
    await expect(cto).toBeDisabled();
    await expect(health).toBeDisabled();
  });

  test("multi-selection submit sends selected items, not only the submit label", async ({
    page,
  }) => {
    const sentMessages: string[] = [];
    await page.unroute("**/api/kody/chat/kody");
    await mockChatStream(page, {
      onRequest: (body) => {
        const latest = body.messages?.at(-1)?.content;
        if (latest) sentMessages.push(latest);
      },
    });
    await openChat(page);

    await sendChatMessage(page, "let me select multiple reports");

    const cto = page.getByRole("checkbox", { name: "CTO Report" });
    const health = page.getByRole("checkbox", { name: "Kody Health Check" });
    const confirm = page.getByRole("button", { name: "Confirm reports" });
    await cto.click();
    await health.click();
    await confirm.click();

    await expect(
      page.getByText("Selected: CTO Report (cto), Kody Health Check (health)"),
    ).toBeVisible();
    await expect(
      page.getByText("Confirm reports", { exact: true }),
    ).toHaveCount(1);
    await expect.poll(() => sentMessages.length).toBeGreaterThanOrEqual(2);
    expect(sentMessages.at(-1)).toContain("cto");
    expect(sentMessages.at(-1)).toContain("health");
    expect(sentMessages.at(-1)).not.toBe("Confirm reports");
  });

  test("resumes a GuidedFlow and advances form input without a model turn", async ({
    page,
  }) => {
    const guidedRequests: Array<Record<string, unknown>> = [];
    await page.route("**/api/kody/guided-flows**", async (route) => {
      if (route.request().method() === "GET") {
        if (route.request().url().includes("instanceId=")) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ flow: { view: guidedFlowView("form", 0) } }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            flows: [
              {
                instance: {
                  instanceId: "guided-flow-e2e",
                  status: "active",
                  revision: 0,
                },
                flow: {
                  id: "create-workflow",
                  title: "Create a workflow",
                  stepIndex: 0,
                  stepCount: 2,
                },
                view: guidedFlowView("form", 0),
              },
            ],
          }),
        });
        return;
      }
      const body = route.request().postDataJSON() as Record<string, unknown>;
      guidedRequests.push(body);
      const action = body.actionId;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          action === "submit"
            ? {
                instance: { status: "active" },
                view: guidedFlowView("review", 1),
              }
            : { instance: { status: "completed" }, navigation: undefined },
        ),
      });
    });
    await openChat(page);

    await expect(
      page.getByText("You have an unfinished GuidedFlow."),
    ).toBeVisible();
    await expect(
      page.getByText("Create a workflow · Step 1 of 2"),
    ).toBeVisible();
    await expect(page.getByLabel("Workflow name")).toHaveCount(0);
    const resume = page.getByRole("button", { name: "Resume flow" });
    await expect(resume).toHaveCount(1);
    const chatUrlBeforeResume = page.url();
    await resume.click();
    await expect(page).toHaveURL(chatUrlBeforeResume);
    await expect(page.getByLabel("Workflow name")).toBeVisible();

    await page.unroute("**/api/kody/chat/kody");
    await mockChatStream(page, { alwaysContent: "Recorded." });
    await sendChatMessage(page, "What does this step mean?");
    await expect(page.getByText("Recorded.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Review workflow" }),
    ).toBeVisible();

    await page
      .getByTestId("chat-header-controls")
      .getByRole("button", { name: "New conversation" })
      .click();
    await expect(
      page.getByText("You have an unfinished GuidedFlow."),
    ).toBeVisible();
    await expect(page.getByLabel("Workflow name")).toHaveCount(0);
    await page.getByRole("button", { name: "Resume flow" }).click();
    await expect(page.getByLabel("Workflow name")).toBeVisible();
    await page.getByRole("button", { name: "Review workflow" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Enter a name" }),
    ).toContainText("Enter a name for this workflow.");
    expect(guidedRequests).toHaveLength(0);
    await page.getByLabel("Workflow name").fill("Nightly checks");
    await page.getByLabel("Capability slug").fill("run-tests");
    await page.getByRole("button", { name: "Review workflow" }).click();

    await expect(
      page.getByText("Review workflow", { exact: true }).last(),
    ).toBeVisible();
    expect(guidedRequests).toHaveLength(1);
    expect(guidedRequests[0]).toMatchObject({
      action: "submit",
      actionId: "submit",
      result: { workflowName: "Nightly checks", capabilitySlug: "run-tests" },
    });

    await page.getByRole("button", { name: "Create workflow" }).click();
    await expect(page.getByText("GuidedFlow completed.")).toBeVisible();
    expect(guidedRequests[1]).toMatchObject({
      action: "submit",
      actionId: "approve",
    });
  });

  test("shows safe guidance when GuidedFlow completion fails", async ({
    page,
  }) => {
    await page.route("**/api/kody/guided-flows**", async (route) => {
      if (route.request().method() === "GET") {
        if (route.request().url().includes("instanceId=")) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              flow: { view: guidedFlowView("review", 1) },
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            flows: [
              {
                instance: {
                  instanceId: "guided-flow-error-e2e",
                  status: "active",
                  revision: 1,
                },
                flow: {
                  id: "create-workflow",
                  title: "Create a workflow",
                  stepIndex: 1,
                  stepCount: 2,
                },
                view: guidedFlowView("review", 1),
              },
            ],
          }),
        });
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "guided_flow_action_failed" }),
      });
    });
    await openChat(page);
    await expect(
      page.getByText("You have an unfinished GuidedFlow."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Resume flow" }).click();
    await expect(
      page.getByRole("button", { name: "Create workflow" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Create workflow" }).click();

    const safeError = page.getByText(
      "We couldn't continue this Guided Flow. Your progress is saved; please try again.",
    );
    await expect(safeError).toBeVisible();
    await expect(page.getByText("guided_flow_action_failed")).toHaveCount(0);
  });

  test("explains duplicate workflow names without exposing backend details", async ({
    page,
  }) => {
    await page.route("**/api/kody/guided-flows**", async (route) => {
      if (route.request().method() === "GET") {
        if (route.request().url().includes("instanceId=")) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              flow: { view: guidedFlowView("review", 1) },
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            flows: [
              {
                instance: {
                  instanceId: "guided-flow-duplicate-e2e",
                  status: "active",
                },
                flow: {
                  id: "create-workflow",
                  title: "Create a workflow",
                  stepIndex: 1,
                  stepCount: 2,
                },
                view: guidedFlowView("review", 1),
              },
            ],
          }),
        });
        return;
      }
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "guided_flow_workflow_exists" }),
      });
    });
    await openChat(page);
    await expect(
      page.getByText("You have an unfinished GuidedFlow."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Resume flow" }).click();
    await expect(
      page.getByRole("button", { name: "Create workflow" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Create workflow" }).click();

    await expect(
      page.getByText(
        "A workflow with this name already exists. Choose a different name and try again.",
      ),
    ).toBeVisible();
    await expect(page.getByText("guided_flow_workflow_exists")).toHaveCount(0);
  });

  test("approval request uses renderer-capable Kody path when a model exists without a saved default", async ({
    page,
  }) => {
    let directChatCalled = false;
    let liveChatCalled = false;
    await page.unroute("**/api/kody/chat/kody");
    await page.route("**/api/kody/chat/kody", async (route: Route) => {
      directChatCalled = true;
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
        },
        body: sseBody([
          {
            type: "tool-input-available",
            toolCallId: "tool-default-kody",
            toolName: "show_view",
            input: { purpose: "fixture", data: { title: "Fixture" } },
          },
          {
            type: "tool-output-available",
            toolCallId: "tool-default-kody",
            output: renderedApprovalView(),
          },
        ]),
      });
    });
    await page.route("**/api/kody/chat/interactive/start*", (route) => {
      liveChatCalled = true;
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "live path should not handle renderer" }),
      });
    });

    await openChat(page, { defaultChatEntry: null });

    await sendChatMessage(
      page,
      "aske me a q and ask for approval to confirm it",
    );

    await expect(page.getByText("Confirm this question?")).toBeVisible();
    expect(directChatCalled).toBe(true);
    expect(liveChatCalled).toBe(false);
  });

  test("failed renderer tool output does not leave a blank assistant reply", async ({
    page,
  }) => {
    const unfinishedProse =
      "Let me just use show_view to ask you directly in-chat:";
    await page.unroute("**/api/kody/chat/kody");
    await page.route("**/api/kody/chat/kody", async (route: Route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
        },
        body: sseBody([
          {
            type: "text-delta",
            delta: unfinishedProse,
          },
          {
            type: "tool-input-available",
            toolCallId: "tool-render-error",
            toolName: "show_view",
            input: { purpose: "approval-card", data: {} },
          },
          {
            type: "tool-output-available",
            toolCallId: "tool-render-error",
            output: { error: "show_view requires data" },
          },
        ]),
      });
    });

    await openChat(page);

    await sendChatMessage(
      page,
      "aske me a q and ask for approval to confirm it",
    );

    await expect(page.getByText(/show_view requires data/i)).toBeVisible();
    await expect(page.getByText(unfinishedProse)).toHaveCount(0);
  });

  test("provider invoke markup does not leak into the visible chat", async ({
    page,
  }) => {
    await page.unroute("**/api/kody/chat/kody");
    await page.route("**/api/kody/chat/kody", async (route: Route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
        },
        body: sseBody([
          {
            type: "reasoning-delta",
            delta:
              'Looking now.\n<invoke name="github_list_tree">]<]minimax[>[<path>/src/app</path>]<]minimax[>[</invoke> ]<]minimax[>[',
          },
          {
            type: "text-delta",
            delta: "The login code is in /src/app.",
          },
        ]),
      });
    });

    await openChat(page);

    await sendChatMessage(page, "find the login code");

    await expect(
      page.getByText("The login code is in /src/app."),
    ).toBeVisible();
    await page.getByRole("button", { name: /thought/i }).click();
    await expect(page.getByText("Looking now.")).toBeVisible();
    await expect(
      page.getByText(/invoke|github_list_tree|minimax|<path>/i),
    ).toHaveCount(0);
  });
});

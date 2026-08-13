import { expect, test, type Route } from "@playwright/test";
import { mockDashboardShellRequests } from "./support/dashboard-shell-mocks";

const OWNER = "agency-e2e";
const REPO = "workspace";

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function view(
  stepId: string,
  revision: number,
  field?: {
    name: string;
    label: string;
    submitLabel: string;
  },
) {
  const isIntroduction = !field;
  return {
    action: "render_view",
    view: "renderer",
    id: `agency-request-${revision}`,
    rendererSlug: isIntroduction ? "approval-card" : "guided-form",
    rendererName: isIntroduction ? "Approval card" : "Guided form",
    resultTarget: "guided-flow",
    guidedFlow: {
      instanceId: "agency-request-instance",
      stepId,
      revision,
    },
    ui: isIntroduction
      ? {
          type: "stack",
          children: [
            {
              type: "text",
              value: "Create an Agency request",
              variant: "title",
            },
            {
              type: "button",
              label: "Begin",
              action: {
                id: "continue",
                label: "Begin",
                response: "continue",
                variant: "primary",
              },
            },
          ],
        }
      : {
          type: "stack",
          children: [
            { type: "text", value: field.label, variant: "title" },
            {
              type: "input",
              name: field.name,
              label: field.label,
              value: "",
              inputType: "textarea",
              readOnly: false,
            },
            { type: "submit", label: field.submitLabel },
          ],
        },
    data: {},
  };
}

test("collects an Agency request and hands it back to Kody for assessment", async ({
  page,
}) => {
  await page.addInitScript(
    ({ owner, repo }) => {
      localStorage.setItem(
        "kody_auth",
        JSON.stringify({
          repoUrl: `https://github.com/${owner}/${repo}`,
          owner,
          repo,
          token: "agency-e2e-token",
          user: { login: "agency-e2e", avatar_url: "", id: 1 },
          loggedInAt: Date.now(),
        }),
      );
    },
    { owner: OWNER, repo: REPO },
  );
  await mockDashboardShellRequests(page);
  await page.route("**/api/kody/auth/me", (route) =>
    json(route, {
      authenticated: true,
      user: { login: "agency-e2e", avatar_url: "", githubId: 1 },
      owner: OWNER,
      repo: REPO,
    }),
  );
  await page.route("**/api/kody/chat/conversations**", (route) =>
    json(route, { conversations: [], turns: [] }),
  );
  await page.route("**/api/kody/models", (route) =>
    json(route, {
      models: [{ id: "test/model", label: "Test model", enabled: true }],
    }),
  );

  const fields = [
    ["desired-outcome", "desiredOutcome", "What should Kody achieve?"],
    ["activation", "activation", "When should Kody act?"],
    ["allowed-actions", "allowedActions", "What may Kody change?"],
    ["success-criteria", "successCriteria", "What proves success?"],
    [
      "additional-context",
      "additionalContext",
      "Anything else Kody should consider?",
    ],
  ] as const;
  await page.route("**/api/kody/guided-flows**", async (route) => {
    if (route.request().method() === "GET") return json(route, { flows: [] });
    const body = route.request().postDataJSON() as {
      action?: string;
      stepId?: string;
    };
    if (body.action === "start") {
      return json(route, {
        instance: { status: "active" },
        flow: { id: "new-agency-request" },
        view: view("introduction", 0),
      });
    }
    const currentIndex = fields.findIndex(([stepId]) => stepId === body.stepId);
    if (body.stepId === "introduction" || currentIndex < fields.length - 1) {
      const nextIndex = body.stepId === "introduction" ? 0 : currentIndex + 1;
      const [stepId, name, label] = fields[nextIndex]!;
      return json(route, {
        instance: { status: "active" },
        flow: { id: "new-agency-request" },
        view: view(stepId, nextIndex + 1, {
          name,
          label,
          submitLabel:
            nextIndex === fields.length - 1 ? "Submit request" : "Continue",
        }),
      });
    }
    return json(route, {
      instance: { status: "completed" },
      flow: { id: "new-agency-request" },
      handoff: {
        type: "kody",
        displayContent: "Request submitted for assessment.",
        message: 'Assess Agency Todo "keep-ci-passing" now.',
      },
    });
  });

  let assessmentMessage = "";
  await page.route("**/api/kody/chat/kody", async (route) => {
    const body = route.request().postDataJSON() as {
      messages?: Array<{ content?: string }>;
    };
    assessmentMessage = body.messages?.at(-1)?.content ?? "";
    return route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body:
        'data: {"type":"text-delta","delta":"I inspected the repository. The plan is ready for approval."}\n\n' +
        'data: {"type":"finish"}\n\n' +
        "data: [DONE]\n\n",
    });
  });

  await page.goto(
    `/repo/${OWNER}/${REPO}/chat?guidedFlow=new-agency-request&instanceKey=ci-repair`,
    { waitUntil: "domcontentloaded" },
  );
  await expect(page.getByText("Create an Agency request")).toBeVisible();
  await page.getByRole("button", { name: "Begin" }).click();

  const answers = [
    "Keep CI passing",
    "When a GitHub Actions run fails",
    "Create a branch and pull request; do not merge",
    "All failed checks pass",
    "Use the installed CI Repair solution",
  ];
  for (let index = 0; index < fields.length; index += 1) {
    const [, , label] = fields[index]!;
    await page.getByRole("textbox", { name: label }).fill(answers[index]!);
    await page
      .locator('[aria-label="Kody chat"] button:enabled')
      .filter({
        hasText:
          index === fields.length - 1 ? "Submit request" : "Continue",
      })
      .last()
      .click();
  }

  await expect(
    page.getByText("Request submitted for assessment."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "I inspected the repository. The plan is ready for approval.",
    ),
  ).toBeVisible();
  expect(assessmentMessage).toBe('Assess Agency Todo "keep-ci-passing" now.');
});

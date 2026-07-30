import { expect, test, type Page, type Route } from "@playwright/test";

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

async function mockQuestionWidget(page: Page) {
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
  await page.route("**/api/kody/widgets/question-select?**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: `
        export const previewData = {
          documentId: "question-1"
        };
        export default function mount(element, props) {
          let disposed = false;
          props.cms.get("quiz-items", props.data.documentId).then((question) => {
            if (disposed) return;
            const section = document.createElement("section");
            section.setAttribute("aria-label", question.title);
            const prompt = document.createElement("p");
            prompt.textContent = question.prompt;
            section.appendChild(prompt);
            for (const option of question.options) {
              const button = document.createElement("button");
              button.textContent = option.label;
              button.onclick = () => {
                if (!option.correct) {
                  props.reply(question.hint);
                  return;
                }
                props.reply(question.solution);
                props.complete("correct", { selectedOptionId: option.id });
              };
              section.appendChild(button);
            }
            element.replaceChildren(section);
          });
          return () => {
            disposed = true;
            element.replaceChildren();
          };
        }
      `,
    }),
  );
  await page.route("**/api/kody/cms/quiz-items/question-1", (route) =>
    json(route, {
      document: {
        _id: "question-1",
        title: "Widget-owned preview",
        prompt: "What is 3 + 4?",
        hint: "Count forward from three.",
        solution: "Correct — the answer is seven.",
        options: [
          { id: "six", label: "6" },
          { id: "seven", label: "7", correct: true },
        ],
      },
    }),
  );
  await page.route("**/api/kody/widgets", (route) =>
    json(route, {
      widgets: [
        {
          tenantId: "acme/widgets",
          slug: "question-select",
          version: 4,
          bundleSize: 1_024,
          updatedAt: "2026-07-30T12:00:00.000Z",
        },
      ],
    }),
  );
}

function guidedWidgetView() {
  return {
    action: "render_view",
    view: "renderer",
    id: "guided-widget-view",
    rendererSlug: "question-select",
    rendererName: "Question select",
    resultTarget: "guided-flow",
    guidedFlow: {
      instanceId: "guided-widget-instance",
      stepId: "question",
      revision: 0,
    },
    ui: {
      type: "widget",
      widget: "question-select",
      data: { documentId: "question-1" },
    },
    data: {},
  };
}

test("plays a tenant widget directly in Chat without starting a Guided Flow", async ({
  page,
}) => {
  await mockQuestionWidget(page);
  await page.goto("/repo/acme/widgets/views/widgets", {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("button", { name: /question-select/ }).click();

  const play = page.getByRole("button", {
    name: "Play question-select in Chat",
  });
  await play.click();

  const widget = page.getByRole("region", { name: "Widget-owned preview" });
  await expect(widget).toContainText("What is 3 + 4?");
  await widget.getByRole("button", { name: "6", exact: true }).click();
  await expect(page.getByText("Count forward from three.")).toBeVisible();
  await expect(
    widget,
  ).toBeVisible();

  await widget.getByRole("button", { name: "7", exact: true }).click();
  await expect(page.getByText("Correct — the answer is seven.")).toBeVisible();
  await expect(page).toHaveURL("/repo/acme/widgets/views/widgets");
  await expect(
    page.getByText("GuidedFlow started. Follow the steps below."),
  ).toHaveCount(0);
});

test("mounts the same independent widget inside a Guided Flow", async ({
  page,
}) => {
  await mockQuestionWidget(page);
  await page.route("**/api/kody/guided-flows", async (route) => {
    if (route.request().method() === "GET") {
      return json(route, { flows: [] });
    }
    const body = route.request().postDataJSON() as { action?: string };
    if (body.action === "start") {
      return json(route, {
        view: guidedWidgetView(),
        instance: { instanceId: "guided-widget-instance", status: "active" },
      });
    }
    return json(route, {
      instance: { instanceId: "guided-widget-instance", status: "completed" },
    });
  });

  await page.goto(
    "/repo/acme/widgets/chat?guidedFlow=widget-lesson&instanceKey=student-1",
    { waitUntil: "domcontentloaded" },
  );

  await expect(
    page.getByText("GuidedFlow started. Follow the steps below."),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Widget-owned preview" }),
  ).toContainText("What is 3 + 4?");

  await page.getByRole("button", { name: "6" }).click();
  await expect(page.getByText("Count forward from three.")).toBeVisible();
  await page.getByRole("button", { name: "7" }).click();

  await expect(page.getByText("Correct — the answer is seven.")).toBeVisible();
  await expect(page.getByText("GuidedFlow completed.")).toBeVisible();
});

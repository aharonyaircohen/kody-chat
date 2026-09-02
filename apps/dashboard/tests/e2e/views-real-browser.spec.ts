/**
 * @testFramework playwright
 * @domain views-browser-mocked
 * @description Mounted Views journey with the Fly API and page stream mocked at
 * their network boundaries. The browser image itself is covered by smoke-test.mjs.
 */
import {
  expect,
  test,
  type Route,
  type WebSocketRoute,
} from "@playwright/test";

import { mockDashboardShellRequests } from "./support/dashboard-shell-mocks";

const FRAME =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ED//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ED//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/ED//2Q==";

const auth = {
  repoUrl: "https://github.com/test-owner/test-repo",
  owner: "test-owner",
  repo: "test-repo",
  token: "ghp_placeholder",
  user: { login: "browser-e2e", avatar_url: "", id: 1 },
  loggedInAt: Date.now(),
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

test("bookmarks, browser controls, picker, URL saving, and stream state stay aligned", async ({
  page,
}) => {
  const environments = [
    { id: "kody", label: "Kody", url: "https://kody.example/app" },
    {
      id: "iana",
      label: "IANA",
      url: "https://www.iana.org/help/example-domains",
    },
    {
      id: "existing-docs",
      label: "example.com docs",
      url: "https://different.example/docs",
    },
  ];
  const history = [environments[0]!.url];
  let historyIndex = 0;
  let revision = 1;
  let stream: WebSocketRoute | null = null;
  let sessionStarts = 0;
  let sessionExists = false;
  const actions: Array<Record<string, unknown>> = [];
  const streamInputs: Array<Record<string, unknown>> = [];

  const pageState = () => ({
    url: history[historyIndex]!,
    title: new URL(history[historyIndex]!).hostname,
    loading: false,
    canGoBack: historyIndex > 0,
    canGoForward: historyIndex < history.length - 1,
    revision,
    viewport: { width: 1280, height: 720 },
  });
  const sendState = () => {
    if (!stream) return;
    stream.send(JSON.stringify({ type: "state", page: pageState() }));
  };

  await page.addInitScript((value) => {
    localStorage.setItem("kody_auth", JSON.stringify(value));
  }, auth);
  await mockDashboardShellRequests(page);
  await page.unroute("**/api/kody/dashboard-config");
  await page.route("**/api/kody/dashboard-config", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as {
        namedPreviews?: typeof environments;
      };
      environments.splice(
        0,
        environments.length,
        ...(body.namedPreviews ?? environments),
      );
    }
    return json(route, { config: { version: 1, namedPreviews: environments } });
  });

  await page.routeWebSocket(/browser\.example\.test\/stream/, (socket) => {
    stream = socket;
    socket.onMessage((raw) => {
      const message = JSON.parse(raw.toString()) as Record<string, unknown>;
      streamInputs.push(message);
      if (message.type === "requestState") sendState();
      if (message.type === "viewport") {
        socket.send(
          JSON.stringify({
            type: "state",
            page: {
              ...pageState(),
              viewport: { width: message.width, height: message.height },
            },
          }),
        );
      }
    });
    setTimeout(() => {
      socket.send(JSON.stringify({ type: "ready" }));
      sendState();
      socket.send(
        JSON.stringify({
          type: "frame",
          frameId: 1,
          data: FRAME,
          metadata: { deviceWidth: 1280, deviceHeight: 720 },
        }),
      );
    }, 20);
  });

  await page.route("**/api/kody/browser/session**", async (route) => {
    const request = route.request();
    const body = request.method() === "POST" ? request.postDataJSON() : null;
    if (!body && !sessionExists) {
      return json(route, { mode: "remote", state: "idle" });
    }
    if (!body || body.operation === "start") {
      if (body?.operation === "start") {
        sessionExists = true;
        sessionStarts += 1;
      }
      return json(route, {
        mode: "remote",
        sessionId: "browser-e2e",
        state: "running",
        currentUrl: pageState().url,
        viewport: pageState().viewport,
        streamUrl: "wss://browser.example.test/stream?ticket=test",
        uploadUrl: "https://browser.example.test/upload?ticket=test",
        ticketExpiresAt: Math.floor(Date.now() / 1000) + 300,
      });
    }
    const action = body.action as Record<string, unknown>;
    actions.push(action);
    if (action.type === "navigate") {
      history.splice(historyIndex + 1);
      history.push(String(action.url));
      historyIndex = history.length - 1;
      revision += 1;
    } else if (action.type === "back" && historyIndex > 0) {
      historyIndex -= 1;
      revision += 1;
    } else if (action.type === "forward" && historyIndex < history.length - 1) {
      historyIndex += 1;
      revision += 1;
    }
    sendState();
    return json(route, {
      ok: true,
      url: pageState().url,
      title: pageState().title,
      page: pageState(),
      ...(action.type === "pick" ? { data: { armed: true } } : {}),
      ...(action.type === "pickResult" ? { data: { element: null } } : {}),
      ...(action.type === "snapshot"
        ? { data: { snapshot: { text: "Visible page", elements: [] } } }
        : {}),
    });
  });

  await page.goto("/repo/test-owner/test-repo/preview/kody");
  const address = page.getByLabel("Current preview URL");
  await expect(page.locator("[data-remote-browser-surface]")).toBeVisible();
  await expect(address).toHaveValue("https://kody.example/app");

  await page.getByTitle(/Switch preview environment/).click();
  await page
    .getByRole("button", { name: "IANA https://www.iana.org/" })
    .click();
  await expect(page).toHaveURL(/\/preview\/iana$/);
  await expect
    .poll(() =>
      actions.some(
        (action) =>
          action.type === "navigate" &&
          action.url === "https://www.iana.org/help/example-domains",
      ),
    )
    .toBe(true);
  await expect(address).toHaveValue(
    "https://www.iana.org/help/example-domains",
  );
  await expect.poll(() => sessionStarts).toBe(1);

  await expect(page.getByLabel("Go back in preview")).toBeEnabled({
    timeout: 5_000,
  });
  await page.getByLabel("Go back in preview").click();
  await expect(address).toHaveValue("https://kody.example/app");
  await page.getByLabel("Go forward in preview").click();
  await expect(address).toHaveValue(
    "https://www.iana.org/help/example-domains",
  );

  await address.fill("https://example.com/docs");
  await address.press("Enter");
  await expect(address).toHaveValue("https://example.com/docs");
  await page.getByTitle("Switch preview environment").click();
  await expect(
    page.locator('[role="option"][aria-selected="true"]'),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByLabel("Save current URL as environment").click();
  await expect
    .poll(() => environments.at(-1)?.label)
    .toBe("example.com docs 2");
  expect(environments.at(-1)?.url).toBe("https://example.com/docs");
  await expect(page).toHaveURL(/\/preview\/example-com-docs-2-[a-z0-9]+$/);
  await expect(page.locator("[data-remote-browser-surface]")).toBeVisible();

  await page.getByLabel("Refresh preview").click();
  await expect
    .poll(() => actions.some((action) => action.type === "reload"))
    .toBe(true);

  await page.getByLabel("Switch preview viewport").click();
  await page.getByRole("option", { name: "Mobile" }).click();
  await expect
    .poll(() =>
      actions.some(
        (action) => action.type === "viewport" && action.width === 390,
      ),
    )
    .toBe(true);

  await page.getByLabel("Inspector actions").click();
  await page.getByRole("menuitem", { name: "Pick element" }).click();
  await expect
    .poll(() => actions.some((action) => action.type === "pick"))
    .toBe(true);

  await page.locator("[data-remote-browser-surface]").dispatchEvent("wheel", {
    deltaX: 0,
    deltaY: 120,
    clientX: 10,
    clientY: 10,
  });
  await expect
    .poll(() =>
      streamInputs.some(
        (input) => input.type === "pointer" && input.action === "wheel",
      ),
    )
    .toBe(true);
});

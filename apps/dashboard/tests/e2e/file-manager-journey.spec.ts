import { expect, test, type Page, type Route } from "@playwright/test";

const OWNER = "file-manager-e2e";
const REPO = "workspace";
const REPO_ROUTE = `/repo/${OWNER}/${REPO}/files`;

interface MockFile {
  content: string;
  sha: string;
}

interface GitTreeEntry {
  path: string;
  sha: string | null;
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installFileManagerHarness(
  page: Page,
  options: { fileReadDelayMs?: number } = {},
) {
  const files = new Map<string, MockFile>([
    ["README.md", { content: "# Workspace\n", sha: "readme-sha" }],
    ["notes.md", { content: "Committed notes\n", sha: "notes-sha" }],
  ]);
  const blobs = new Map<string, string>();
  const unhandledGitHubRequests: string[] = [];
  let pendingTree: GitTreeEntry[] = [];
  let sequence = 1;

  await page.addInitScript(
    ({ owner, repo }) => {
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (...args) => nativeFetch(...args);
      localStorage.setItem(
        "kody_auth",
        JSON.stringify({
          repoUrl: `https://github.com/${owner}/${repo}`,
          owner,
          repo,
          token: "e2e-token",
          user: {
            login: "file-manager-e2e",
            avatar_url: "",
            id: 1,
          },
          loggedInAt: Date.now(),
          repos: [
            {
              repoUrl: `https://github.com/${owner}/${repo}`,
              owner,
              repo,
              token: "e2e-token",
              addedAt: Date.now(),
              isLogin: true,
              user: {
                login: "file-manager-e2e",
                avatar_url: "",
                id: 1,
              },
            },
          ],
          currentRepoIndex: 0,
        }),
      );
    },
    { owner: OWNER, repo: REPO },
  );

  await page.route("**/api/kody/auth/me", (route) =>
    json(route, {
      authenticated: true,
      user: {
        login: "file-manager-e2e",
        avatar_url: "",
        githubId: 1,
      },
      owner: OWNER,
      repo: REPO,
    }),
  );
  await page.route("**/api/kody/models", (route) =>
    json(route, { models: [] }),
  );
  await page.route("**/api/kody/commands", (route) =>
    json(route, { commands: [] }),
  );
  await page.route("**/api/kody/chat/conversations**", (route) =>
    json(route, { conversations: [], turns: [] }),
  );
  await page.route("**/api/kody/system-events", (route) =>
    json(route, { events: [] }),
  );
  await page.route("**/api/kody/guided-flows", (route) =>
    json(route, { flows: [] }),
  );
  await page.route("**/api/kody/secrets**", (route) =>
    json(
      route,
      new URL(route.request().url()).pathname.endsWith("/FLY_API_TOKEN/value")
        ? { value: null }
        : { secrets: [] },
    ),
  );

  await page.route("https://api.github.com/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = decodeURIComponent(url.pathname);
    const method = request.method();
    const repoPrefix = `/repos/${OWNER}/${REPO}`;

    if (pathname === repoPrefix && method === "GET") {
      return json(route, { default_branch: "main" });
    }
    if (pathname === `${repoPrefix}/git/ref/heads/main` && method === "GET") {
      return json(route, { object: { sha: "head-1" } });
    }
    if (pathname === `${repoPrefix}/git/commits/head-1` && method === "GET") {
      return json(route, { sha: "head-1", tree: { sha: "tree-1" } });
    }
    if (pathname === `${repoPrefix}/git/blobs` && method === "POST") {
      const body = request.postDataJSON() as { content: string };
      const sha = `blob-${sequence++}`;
      blobs.set(sha, body.content);
      return json(route, { sha }, 201);
    }
    if (pathname === `${repoPrefix}/git/trees` && method === "POST") {
      const body = request.postDataJSON() as { tree: GitTreeEntry[] };
      pendingTree = body.tree;
      return json(route, { sha: `tree-${sequence++}` }, 201);
    }
    if (pathname === `${repoPrefix}/git/commits` && method === "POST") {
      return json(route, { sha: `commit-${sequence++}` }, 201);
    }
    if (
      pathname === `${repoPrefix}/git/refs/heads/main` &&
      method === "PATCH"
    ) {
      for (const entry of pendingTree) {
        if (entry.sha === null) {
          files.delete(entry.path);
          continue;
        }
        files.set(entry.path, {
          content: Buffer.from(blobs.get(entry.sha) ?? "", "base64").toString(
            "utf8",
          ),
          sha: entry.sha,
        });
      }
      pendingTree = [];
      return json(route, { object: { sha: "head-2" } });
    }

    const contentsPrefix = `${repoPrefix}/contents`;
    if (pathname.startsWith(contentsPrefix)) {
      const path = pathname.slice(contentsPrefix.length).replace(/^\/+/, "");

      if (method === "PUT") {
        const body = request.postDataJSON() as { content: string };
        const sha = `content-${sequence++}`;
        files.set(path, {
          content: Buffer.from(body.content, "base64").toString("utf8"),
          sha,
        });
        return json(
          route,
          { content: { path, sha }, commit: { sha: `commit-${sequence++}` } },
          201,
        );
      }

      if (method === "DELETE" && files.has(path)) {
        files.delete(path);
        return json(route, {
          content: null,
          commit: { sha: `commit-${sequence++}` },
        });
      }

      if (method === "GET" && files.has(path)) {
        if (options.fileReadDelayMs) {
          await new Promise((resolve) =>
            setTimeout(resolve, options.fileReadDelayMs),
          );
        }
        const file = files.get(path)!;
        return json(route, {
          type: "file",
          name: path.split("/").pop(),
          path,
          sha: file.sha,
          size: Buffer.byteLength(file.content),
          encoding: "base64",
          content: Buffer.from(file.content).toString("base64"),
        });
      }

      if (method === "GET") {
        const prefix = path ? `${path}/` : "";
        const entries = new Map<string, Record<string, unknown>>();
        for (const [filePath, file] of files) {
          if (!filePath.startsWith(prefix)) continue;
          const remainder = filePath.slice(prefix.length);
          const [name, ...nested] = remainder.split("/");
          if (!name) continue;
          const entryPath = prefix + name;
          entries.set(
            name,
            nested.length > 0
              ? {
                  type: "dir",
                  name,
                  path: entryPath,
                  sha: `dir-${name}`,
                  size: 0,
                }
              : {
                  type: "file",
                  name,
                  path: entryPath,
                  sha: file.sha,
                  size: Buffer.byteLength(file.content),
                },
          );
        }
        if (entries.size > 0 || path === "") {
          return json(route, [...entries.values()]);
        }
        return json(route, { message: "Not Found" }, 404);
      }
    }

    unhandledGitHubRequests.push(`${method} ${pathname}`);
    return json(route, { message: "Not Found" }, 404);
  });

  return { files, unhandledGitHubRequests };
}

function collectRuntimeFailures(page: Page) {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => {
    const text = message.text();
    if (
      message.type() === "error" &&
      !text.startsWith("Failed to load resource:") &&
      !text.includes(
        "/contents/e2e-workspace%2Frenamed.txt - 404 with id UNKNOWN",
      )
    ) {
      failures.push(text);
    }
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    const isOptionalMonacoWorker =
      url.hostname === "cdn.jsdelivr.net" &&
      url.pathname.includes("/monaco-editor@") &&
      url.pathname.includes("/assets/editor.worker-") &&
      url.pathname.endsWith(".js");
    if (isOptionalMonacoWorker) return;
    failures.push(`${request.method()} ${request.url()} failed`);
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const url = response.url();
    const isExpectedExistenceProbe =
      response.status() === 404 &&
      decodeURIComponent(url).includes(
        `/repos/${OWNER}/${REPO}/contents/e2e-workspace/renamed.txt`,
      );
    const isOptionalAsset =
      response.status() === 404 && new URL(url).pathname === "/favicon.svg";
    if (!isExpectedExistenceProbe && !isOptionalAsset) {
      failures.push(`${response.status()} ${url}`);
    }
  });
  return failures;
}

test.describe("repository file manager", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "One desktop journey covers the file workspace contract.",
    );
  });

  test("creates, renames, and deletes repository items", async ({ page }) => {
    const runtimeFailures = collectRuntimeFailures(page);
    const { files, unhandledGitHubRequests } =
      await installFileManagerHarness(page);

    await page.goto(REPO_ROUTE, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();
    await expect(
      page.getByRole("treeitem", { name: "README.md 12 B" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "More file actions" }).click();
    const newFolderAction = page.getByRole("menuitem", { name: "New folder" });
    await expect(newFolderAction).toBeVisible();
    await newFolderAction.click();
    const folderDialog = page.getByRole("dialog", { name: "New folder" });
    await folderDialog
      .getByPlaceholder("folder-name or nested/path")
      .fill("e2e-workspace");
    await folderDialog.getByRole("button", { name: "Create" }).click();
    await expect.poll(() => files.has("e2e-workspace/.gitkeep")).toBe(true);
    await expect(page).toHaveURL(/\/files\/e2e-workspace$/);
    await expect(page.getByText("Current space")).toBeVisible();

    await page.goto(REPO_ROUTE, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("treeitem", { name: "README.md 12 B" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "More file actions" }).click();
    const newFileAction = page.getByRole("menuitem", { name: "New file" });
    await expect(newFileAction).toBeVisible();
    await newFileAction.click();
    const fileDialog = page.getByRole("dialog", { name: "New file" });
    await fileDialog
      .getByPlaceholder("filename.txt or nested/path.txt")
      .fill("draft.txt");
    await fileDialog.getByRole("button", { name: "Create" }).click();
    await expect.poll(() => files.has("draft.txt")).toBe(true);
    await expect(page).toHaveURL(/\/files\/draft\.txt$/);

    await page.getByRole("button", { name: "More file actions" }).click();
    await page.getByRole("menuitem", { name: "Rename or move" }).click();
    const moveDialog = page.getByRole("dialog", { name: "Rename or move" });
    await moveDialog.getByRole("textbox").fill("e2e-workspace/renamed.txt");
    await moveDialog.getByRole("button", { name: "Move" }).click();
    await expect
      .poll(() => ({
        oldPath: files.has("draft.txt"),
        newPath: files.has("e2e-workspace/renamed.txt"),
        unhandledGitHubRequests,
      }))
      .toEqual({
        oldPath: false,
        newPath: true,
        unhandledGitHubRequests: [],
      });

    await page.getByRole("button", { name: "More file actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const deleteDialog = page.getByRole("dialog", { name: "Delete file" });
    await deleteDialog.getByRole("button", { name: "Delete" }).click();
    await expect.poll(() => files.has("e2e-workspace/renamed.txt")).toBe(false);
    await expect(
      page.getByText("Choose what you want to work on"),
    ).toBeVisible();
    expect(runtimeFailures).toEqual([]);
  });

  test("restores an unsaved local draft after reload", async ({ page }) => {
    const runtimeFailures = collectRuntimeFailures(page);
    await installFileManagerHarness(page);

    await page.goto(REPO_ROUTE, { waitUntil: "domcontentloaded" });
    await page.getByRole("treeitem", { name: "notes.md 16 B" }).click();

    const editor = page.getByRole("textbox", { name: "Editor content" });
    await editor.click({ force: true });
    await editor.press("Control+A");
    await editor.press("Backspace");
    await editor.type("Unsaved browser draft");
    await expect(
      page.getByRole("button", { name: "Save changes" }),
    ).toBeEnabled();
    await expect
      .poll(() =>
        page.evaluate(
          (key) => localStorage.getItem(key),
          `kody:file-draft:${OWNER}/${REPO}/notes.md`,
        ),
      )
      .toContain("Unsaved browser draft");

    await page.evaluate(() => document.fonts.ready);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("treeitem", { name: "notes.md 16 B" }).click();
    await expect(
      page.getByText("Unsaved browser draft", { exact: true }),
    ).toBeVisible();
    expect(runtimeFailures).toEqual([]);
  });

  test("keeps a file in place while its contents load", async ({ page }) => {
    const runtimeFailures = collectRuntimeFailures(page);
    await installFileManagerHarness(page, { fileReadDelayMs: 3_000 });

    await page.goto(REPO_ROUTE, { waitUntil: "domcontentloaded" });
    const treeItems = page.getByRole("treeitem");
    await expect(treeItems).toHaveCount(2);
    await expect(treeItems.nth(0)).toContainText("README.md");
    await expect(treeItems.nth(1)).toContainText("notes.md");

    await page.evaluate(() => {
      const snapshots: Array<Array<{ text: string; expanded: string | null }>> =
        [];
      const capture = () => {
        snapshots.push(
          [...document.querySelectorAll('[role="treeitem"]')].map((item) => ({
            text: item.textContent?.trim() ?? "",
            expanded: item.getAttribute("aria-expanded"),
          })),
        );
      };
      capture();
      new MutationObserver(capture).observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
      });
      Object.assign(window, { __fileTreeSnapshots: snapshots });
    });

    const notes = page.getByRole("treeitem", { name: "notes.md 16 B" });
    await notes.click();
    await expect(page).toHaveURL(/\/files\/notes\.md$/);
    await expect(
      page.getByRole("textbox", { name: "Editor content" }),
    ).toBeVisible();

    const loadingSnapshots = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __fileTreeSnapshots: Array<
              Array<{ text: string; expanded: string | null }>
            >;
          }
        ).__fileTreeSnapshots,
    );
    const stableSnapshot = [
      { text: "README.md12 B", expanded: null },
      { text: "notes.md16 B", expanded: null },
    ];
    expect(loadingSnapshots).not.toEqual([]);
    expect(loadingSnapshots.every((snapshot) =>
      JSON.stringify(snapshot) === JSON.stringify(stableSnapshot),
    )).toBe(true);
    expect(runtimeFailures).toEqual([]);
  });
});

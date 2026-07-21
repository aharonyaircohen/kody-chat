import { expect, test, type Page, type Route } from "@playwright/test";

const OWNER = "file-spaces-e2e";
const REPO = "workspace";
const CANONICAL_URL = `/repo/${OWNER}/${REPO}/file-spaces`;

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
          token: "file-spaces-token",
          user: { login: "file-spaces-e2e", avatar_url: "", id: 1 },
          loggedInAt: Date.now(),
          repos: [
            {
              repoUrl: `https://github.com/${owner}/${repo}`,
              owner,
              repo,
              token: "file-spaces-token",
              addedAt: Date.now(),
              isLogin: true,
              user: { login: "file-spaces-e2e", avatar_url: "", id: 1 },
            },
          ],
          currentRepoIndex: 0,
        }),
      );
    },
    { owner: OWNER, repo: REPO },
  );
}

test("user creates a file space, moves and deletes a markdown file, then deletes its folder", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];
  const createdBodies: unknown[] = [];
  let testFilePath: string | null = null;
  let archiveExists = true;
  const spaces: Array<{
    id: string;
    title: string;
    slug: string;
    rootPath: string;
    builtIn?: boolean;
  }> = [
    {
      id: "docs",
      title: "Docs",
      slug: "docs",
      rootPath: "docs",
      builtIn: true,
    },
  ];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      failedResponses.push(`${response.status()} ${response.url()}`);
  });

  await seedAuth(page);
  await page.route("**/api/kody/file-spaces**", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { title: string };
      createdBodies.push(body);
      const space = {
        id: "team-notes",
        title: body.title,
        slug: "team-notes",
        rootPath: "team-notes",
      };
      spaces.push(space);
      return json(route, { space }, 201);
    }
    return json(route, { spaces });
  });
  await page.route("**/api/kody/auth/me", (route) =>
    json(route, {
      authenticated: true,
      user: { login: "file-spaces-e2e", avatar_url: "", githubId: 1 },
      owner: OWNER,
      repo: REPO,
    }),
  );
  await page.route("**/api/kody/cms", (route) =>
    json(route, { cms: { configured: false, collections: [] } }),
  );
  await page.route("**/api/kody/navigation-favorites", (route) =>
    json(route, { favoriteHrefs: [] }),
  );
  await page.route("**/api/kody/chat/conversations**", (route) =>
    json(route, { conversations: [], turns: [] }),
  );
  await page.route("**/api/kody/system-events", (route) =>
    json(route, { events: [] }),
  );
  await page.route("**/api/kody/commands", (route) =>
    json(route, { commands: [] }),
  );
  await page.route("**/api/kody/guided-flows", (route) =>
    json(route, { flows: [] }),
  );
  await page.route("**/api/kody/models", (route) =>
    json(route, { models: [] }),
  );
  await page.route("https://api.github.com/**", (route) => {
    const pathname = decodeURIComponent(
      new URL(route.request().url()).pathname,
    );
    const method = route.request().method();
    const repoPrefix = `/repos/${OWNER}/${REPO}`;
    if (pathname === repoPrefix && method === "GET") {
      return json(route, { default_branch: "main" });
    }
    if (pathname === `${repoPrefix}/git/ref/heads/main` && method === "GET") {
      return json(route, { object: { sha: "head-sha" } });
    }
    if (pathname === `${repoPrefix}/git/commits/head-sha` && method === "GET") {
      return json(route, { tree: { sha: "tree-sha" } });
    }
    if (pathname === `${repoPrefix}/git/blobs` && method === "POST") {
      return json(route, { sha: "test-blob-sha" }, 201);
    }
    if (pathname === `${repoPrefix}/git/trees` && method === "POST") {
      const body = route.request().postDataJSON() as {
        tree: Array<{ path: string; sha: string | null }>;
      };
      for (const entry of body.tree.filter((item) =>
        item.path.endsWith("/Test.md"),
      )) {
        if (entry.sha !== null) testFilePath = entry.path;
        else if (testFilePath === entry.path) testFilePath = null;
      }
      if (
        body.tree.some(
          (entry) =>
            entry.path === "team-notes/Archive/.gitkeep" && entry.sha === null,
        )
      ) {
        archiveExists = false;
      }
      return json(route, { sha: "next-tree-sha" }, 201);
    }
    if (pathname === `${repoPrefix}/git/commits` && method === "POST") {
      return json(route, { sha: "next-commit-sha" }, 201);
    }
    if (
      pathname === `${repoPrefix}/git/refs/heads/main` &&
      method === "PATCH"
    ) {
      return json(route, { object: { sha: "next-commit-sha" } });
    }
    if (pathname.endsWith("/contents/team-notes/Test.md") && method === "PUT") {
      testFilePath = "team-notes/Test.md";
      return json(
        route,
        {
          content: { path: "team-notes/Test.md", sha: "test-sha" },
          commit: { sha: "create-commit-sha" },
        },
        201,
      );
    }
    if (
      testFilePath !== null &&
      pathname.endsWith(`/contents/${testFilePath}`) &&
      method === "DELETE"
    ) {
      testFilePath = null;
      return json(route, { content: null, commit: { sha: "delete-commit-sha" } });
    }
    if (
      pathname.endsWith("/contents/team-notes/Archive/.gitkeep") &&
      method === "DELETE"
    ) {
      archiveExists = false;
      return json(route, { content: null, commit: { sha: "delete-folder-commit-sha" } });
    }
    if (
      testFilePath !== null &&
      pathname.endsWith(`/contents/${testFilePath}`) &&
      method === "GET" &&
      testFilePath !== null
    ) {
      return json(route, {
        type: "file",
        name: "Test.md",
        path: testFilePath,
        sha: "test-sha",
        size: 0,
        encoding: "base64",
        content: "",
      });
    }
    if (pathname.endsWith("/contents/team-notes")) {
      return json(
        route,
        archiveExists
          ? [
              {
                type: "dir",
                name: "Archive",
                path: "team-notes/Archive",
                sha: "archive-sha",
                size: 0,
              },
            ]
          : [],
      );
    }
    if (
      pathname.endsWith("/contents/team-notes/Archive/.gitkeep") &&
      archiveExists
    ) {
      return json(route, {
        type: "file",
        name: ".gitkeep",
        path: "team-notes/Archive/.gitkeep",
        sha: "gitkeep-sha",
        size: 0,
        encoding: "base64",
        content: "",
      });
    }
    if (pathname.endsWith("/contents/team-notes/Archive") && archiveExists) {
      return json(route, [
        {
          type: "file",
          name: ".gitkeep",
          path: "team-notes/Archive/.gitkeep",
          sha: "gitkeep-sha",
          size: 0,
        },
      ]);
    }
    return json(route, {});
  });

  await page.goto(CANONICAL_URL);
  await expect(
    page.getByRole("heading", { name: "File spaces" }),
  ).toBeVisible();
  await expect(
    page.locator("nav").getByRole("link", { name: "File spaces", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Docs /docs" })).toBeVisible();

  await page.getByRole("button", { name: "New space" }).click();
  await page.getByPlaceholder("Notes").fill("Team Notes");
  await page.getByRole("button", { name: "Save" }).click();

  const link = page.getByRole("link", { name: "Team Notes /team-notes" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute(
    "href",
    `/repo/${OWNER}/${REPO}/file-spaces/team-notes`,
  );
  expect(createdBodies).toEqual([{ title: "Team Notes" }]);

  await link.click();
  await page.getByRole("button", { name: "More file actions" }).click();
  await page.getByRole("menuitem", { name: "New file" }).click();
  const newFileDialog = page.getByRole("dialog", { name: "New file" });
  await newFileDialog.getByPlaceholder("Document title").fill("Test");
  await newFileDialog.getByRole("button", { name: "Create" }).click();
  await expect.poll(() => testFilePath).toBe("team-notes/Test.md");
  await expect(
    page.getByRole("tree").getByText("Test.md", { exact: true }),
  ).toBeVisible();

  const rootFile = page.getByRole("treeitem").filter({ hasText: "Test.md" });
  const archiveFolder = page.getByRole("treeitem", { name: "Archive" });
  await rootFile.dragTo(archiveFolder);
  await expect.poll(() => testFilePath).toBe("team-notes/Archive/Test.md");
  await archiveFolder.press("ArrowRight");
  const nestedFile = page
    .getByRole("treeitem")
    .filter({ hasText: "Test.md" })
    .last();
  await nestedFile.dragTo(page.getByTestId("file-tree-root-drop-target"));
  await expect.poll(() => testFilePath).toBe("team-notes/Test.md");

  await page.getByRole("button", { name: "More file actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete file" });
  await deleteDialog.getByRole("button", { name: "Delete" }).click();
  await expect.poll(() => testFilePath).toBe(null);
  await expect(page.getByText("Choose what you want to work on")).toBeVisible();

  await page.getByRole("treeitem", { name: "Archive" }).click();
  await page.getByRole("button", { name: "More file actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const deleteFolderDialog = page.getByRole("dialog", {
    name: "Delete folder",
  });
  await deleteFolderDialog.getByRole("button", { name: "Delete" }).click();
  await expect.poll(() => archiveExists).toBe(false);
  await expect(page.getByRole("treeitem", { name: "Archive" })).toHaveCount(0);
  expect(pageErrors).toEqual([]);
  expect(failedResponses).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

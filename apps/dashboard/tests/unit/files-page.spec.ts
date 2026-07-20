/**
 * Unit tests for FilesPage breadcrumb-building logic.
 */
import { describe, it, expect } from "vitest";
import {
  buildBreadcrumbs,
  buildFileHref,
  currentFolderPath,
  duplicatePath,
  githubFileUrl,
  isExpectedDeletedPath,
  joinRepoPath,
  normalizeRepoPath,
  parentRepoPath,
  replacePathPrefix,
  shouldShowWorkspaceLocation,
} from "@dashboard/features/file-manager/lib/file-paths";

describe("buildBreadcrumbs", () => {
  it("returns empty array for empty path", () => {
    expect(buildBreadcrumbs("")).toEqual([]);
  });

  it("returns single item for a file in root", () => {
    expect(buildBreadcrumbs("README.md")).toEqual([
      { path: "README.md", label: "README.md" },
    ]);
  });

  it("builds correct trail for a nested file", () => {
    expect(buildBreadcrumbs("src/components/Button.tsx")).toEqual([
      { path: "src", label: "src" },
      { path: "src/components", label: "components" },
      { path: "src/components/Button.tsx", label: "Button.tsx" },
    ]);
  });

  it("builds correct trail for deeply nested path", () => {
    const result = buildBreadcrumbs("a/b/c/d/e.txt");
    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({ path: "a", label: "a" });
    expect(result[2]).toEqual({ path: "a/b/c", label: "c" });
    expect(result[4]).toEqual({ path: "a/b/c/d/e.txt", label: "e.txt" });
  });

  it("each crumb's path is the full prefix path", () => {
    const result = buildBreadcrumbs("foo/bar/baz.txt");
    expect(result[0].path).toBe("foo");
    expect(result[1].path).toBe("foo/bar");
    expect(result[2].path).toBe("foo/bar/baz.txt");
  });

  it("label is always just the final segment", () => {
    const result = buildBreadcrumbs("foo/bar/baz.txt");
    expect(result[0].label).toBe("foo");
    expect(result[1].label).toBe("bar");
    expect(result[2].label).toBe("baz.txt");
  });

  it("handles paths with dots in directory names", () => {
    const result = buildBreadcrumbs(".github/workflows/ci.yml");
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ path: ".github", label: ".github" });
    expect(result[1]).toEqual({
      path: ".github/workflows",
      label: "workflows",
    });
    expect(result[2]).toEqual({
      path: ".github/workflows/ci.yml",
      label: "ci.yml",
    });
  });
});

describe("normalizeRepoPath", () => {
  it("removes leading and trailing slashes", () => {
    expect(normalizeRepoPath("/src/components/")).toBe("src/components");
  });

  it("collapses repeated separators", () => {
    expect(normalizeRepoPath("src//components///Button.tsx")).toBe(
      "src/components/Button.tsx",
    );
  });
});

describe("parentRepoPath", () => {
  it("returns root for a root file", () => {
    expect(parentRepoPath("README.md")).toBe("");
  });

  it("returns the containing folder for a nested file", () => {
    expect(parentRepoPath("src/components/Button.tsx")).toBe("src/components");
  });
});

describe("currentFolderPath", () => {
  it("uses the selected folder directly", () => {
    expect(currentFolderPath("src/components", "dir")).toBe("src/components");
  });

  it("uses the parent folder when a file is selected", () => {
    expect(currentFolderPath("src/components/Button.tsx", "file")).toBe(
      "src/components",
    );
  });

  it("uses root when nothing is selected", () => {
    expect(currentFolderPath(null, null)).toBe("");
  });
});

describe("shouldShowWorkspaceLocation", () => {
  it("keeps folder context visible", () => {
    expect(shouldShowWorkspaceLocation("dir", "viewer")).toBe(true);
  });

  it("lets the document own the header while viewing or editing a file", () => {
    expect(shouldShowWorkspaceLocation("file", "viewer")).toBe(false);
    expect(shouldShowWorkspaceLocation("file", "editor")).toBe(false);
  });

  it("keeps navigation available for search and upload modes", () => {
    expect(shouldShowWorkspaceLocation("file", "search")).toBe(true);
    expect(shouldShowWorkspaceLocation("file", "upload")).toBe(true);
  });
});

describe("joinRepoPath", () => {
  it("joins child names under the current folder", () => {
    expect(joinRepoPath("src/components", "Button.tsx")).toBe(
      "src/components/Button.tsx",
    );
  });

  it("normalizes extra slashes", () => {
    expect(joinRepoPath("/src//components/", "/forms/Input.tsx")).toBe(
      "src/components/forms/Input.tsx",
    );
  });
});

describe("replacePathPrefix", () => {
  it("moves a file under a renamed folder", () => {
    expect(replacePathPrefix("src/a/b.ts", "src", "lib")).toBe("lib/a/b.ts");
  });

  it("moves the exact path itself", () => {
    expect(replacePathPrefix("src", "src", "lib")).toBe("lib");
  });

  it("leaves unrelated paths alone", () => {
    expect(replacePathPrefix("source/a.ts", "src", "lib")).toBe("source/a.ts");
  });
});

describe("duplicatePath", () => {
  it("adds copy before a file extension", () => {
    expect(duplicatePath("src/Button.tsx", "file")).toBe("src/Button copy.tsx");
  });

  it("adds copy after an extensionless file", () => {
    expect(duplicatePath("README", "file")).toBe("README copy");
  });

  it("adds -copy to folders", () => {
    expect(duplicatePath("src/components", "dir")).toBe("src/components-copy");
  });
});

describe("githubFileUrl", () => {
  it("builds a GitHub blob URL for files", () => {
    expect(githubFileUrl("acme", "repo", "src/Button.tsx", "file")).toBe(
      "https://github.com/acme/repo/blob/HEAD/src/Button.tsx",
    );
  });

  it("builds a GitHub tree URL for folders", () => {
    expect(githubFileUrl("acme", "repo", "src/components", "dir")).toBe(
      "https://github.com/acme/repo/tree/HEAD/src/components",
    );
  });
});

describe("buildFileHref", () => {
  it("returns the files root for an empty path", () => {
    expect(buildFileHref("")).toBe("/files");
  });

  it("builds a nested file route", () => {
    expect(buildFileHref("src/components/Button.tsx")).toBe(
      "/files/src/components/Button.tsx",
    );
  });

  it("encodes URL-sensitive path segments", () => {
    expect(buildFileHref("docs/What now?.md")).toBe(
      "/files/docs/What%20now%3F.md",
    );
  });
});

describe("isExpectedDeletedPath", () => {
  it("matches a deleted file and stale reads below a deleted folder", () => {
    const deletedPaths = new Set(["docs/old.md", "docs/old-folder"]);

    expect(isExpectedDeletedPath("docs/old.md", deletedPaths)).toBe(true);
    expect(
      isExpectedDeletedPath("docs/old-folder/nested.md", deletedPaths),
    ).toBe(true);
    expect(isExpectedDeletedPath("docs/current.md", deletedPaths)).toBe(false);
  });
});

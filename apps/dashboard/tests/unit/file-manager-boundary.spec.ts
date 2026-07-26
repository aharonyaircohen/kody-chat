import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const FILE_MANAGER_ROOT = join(
  process.cwd(),
  "src/dashboard/features/file-manager",
);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function internalImports(source: string): string[] {
  return [...source.matchAll(/(?:from\s+|import\()["'](@[^"']+)/g)].map(
    ([, specifier]) => specifier,
  );
}

describe("File Manager dependency boundary", () => {
  it("depends on no monorepo code except @kody-ade/base", () => {
    const violations = sourceFiles(FILE_MANAGER_ROOT).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return internalImports(source)
        .filter(
          (specifier) =>
            specifier.startsWith("@dashboard/") ||
            (specifier.startsWith("@kody-ade/") &&
              !specifier.startsWith("@kody-ade/base/")),
        )
        .map((specifier) => ({
          file: path.slice(FILE_MANAGER_ROOT.length + 1),
          specifier,
        }));
    });

    expect(violations).toEqual([]);
  });

  it("keeps dashboard composition outside the File Manager", () => {
    const core = readFileSync(
      join(FILE_MANAGER_ROOT, "components/FilesPage.tsx"),
      "utf8",
    );
    const host = readFileSync(
      join(
        process.cwd(),
        "src/dashboard/features/file-spaces/DashboardFilesPage.tsx",
      ),
      "utf8",
    );

    expect(core).not.toContain("useAuth");
    expect(core).not.toContain("useRepoScopedHref");
    expect(core).not.toContain("createGitHubFilesTransport");
    expect(host).toContain("useAuth");
    expect(host).toContain("useRepoScopedHref");
    expect(host).toContain("createGitHubFilesTransport");
  });
});

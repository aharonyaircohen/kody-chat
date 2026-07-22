import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(process.cwd(), "../..");
const dashboardApp = join(repositoryRoot, "apps/dashboard/app");
const integrationApp = join(repositoryRoot, "packages/kody-chat-dashboard/app");
const dashboardTests = join(repositoryRoot, "apps/dashboard/tests");
const integrationTests = join(
  repositoryRoot,
  "packages/kody-chat-dashboard/tests",
);
const dashboardSource = join(repositoryRoot, "apps/dashboard/src/dashboard");
const integrationSource = join(
  repositoryRoot,
  "packages/kody-chat-dashboard/src/dashboard",
);

function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

describe("private integration app ownership", () => {
  it("does not keep byte-identical app implementations in both workspaces", () => {
    const duplicated = files(integrationApp)
      .map((path) => relative(integrationApp, path))
      .filter((path) => {
        try {
          return (
            readFileSync(join(dashboardApp, path), "utf8") ===
            readFileSync(join(integrationApp, path), "utf8")
          );
        } catch {
          return false;
        }
      });

    expect(duplicated).toEqual([]);
  });

  it("does not run byte-identical tests in both workspaces", () => {
    const duplicated = files(integrationTests)
      .map((path) => relative(integrationTests, path))
      .filter((path) => /\.(?:int\.)?spec\.ts$/.test(path))
      .filter((path) => {
        try {
          return (
            readFileSync(join(dashboardTests, path), "utf8") ===
            readFileSync(join(integrationTests, path), "utf8")
          );
        } catch {
          return false;
        }
      });

    expect(duplicated).toEqual([]);
  });

  it("does not keep byte-identical source implementations in both workspaces", () => {
    const duplicated = files(integrationSource)
      .map((path) => relative(integrationSource, path))
      // This hook intentionally resolves each workspace's different local
      // inbox type contract, so identical source text is not shared ownership.
      .filter(
        (path) =>
          path !== "lib/inbox/useInbox.ts" &&
          path !== "lib/chat-defaults/index.ts",
      )
      .filter((path) => {
        try {
          return (
            readFileSync(join(dashboardSource, path), "utf8") ===
            readFileSync(join(integrationSource, path), "utf8")
          );
        } catch {
          return false;
        }
      });

    expect(duplicated).toEqual([]);
  });
});

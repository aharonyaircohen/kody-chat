import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(process.cwd(), "../..");
const dashboardApp = join(repositoryRoot, "apps/dashboard/app");
const integrationApp = join(repositoryRoot, "packages/kody-chat-dashboard/app");

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
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(process.cwd(), "../..");

function readPackage(relativePath: string) {
  return JSON.parse(
    readFileSync(resolve(repositoryRoot, relativePath), "utf8"),
  ) as {
    description?: string;
    scripts?: Record<string, string>;
  };
}

describe("workspace command ownership", () => {
  it("starts the real Dashboard from the root dev command", () => {
    const rootPackage = readPackage("package.json");

    expect(rootPackage.scripts?.dev).toBe("pnpm --filter kody-dashboard dev");
    expect(rootPackage.scripts?.["dev:dashboard"]).toBe(
      "pnpm --filter kody-dashboard dev",
    );
  });

  it("names the private integration harness explicitly", () => {
    const rootPackage = readPackage("package.json");
    const integrationPackage = readPackage(
      "packages/kody-chat-dashboard/package.json",
    );

    expect(rootPackage.scripts?.["dev:chat-integration"]).toBe(
      "pnpm --filter @kody-ade/kody-chat-dashboard dev",
    );
    expect(integrationPackage.description).toBe(
      "Private Kody Dashboard chat integration and development harness",
    );
  });
});

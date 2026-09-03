import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(process.cwd(), "../..");

describe("MCP production workflow", () => {
  it("disables Vercel Git auto-deployments", () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
    );

    expect(config.git?.deploymentEnabled).toBe(false);
  });

  it("releases only after successful CI through the gated command", () => {
    const workflow = readFileSync(
      resolve(repoRoot, ".github/workflows/deploy-dashboard.yml"),
      "utf8",
    );

    expect(workflow).toContain("workflow_run:");
    expect(workflow).toContain('workflows: ["CI"]');
    expect(workflow).toContain("conclusion == 'success'");
    expect(workflow).toContain("pnpm release:mcp:production");
    expect(workflow).not.toContain("vercel --prod");
    expect(workflow).not.toContain("vercel alias set");
  });
});

import { describe, expect, it, vi } from "vitest";
import { runMcpProductionRelease } from "../../scripts/release-mcp-production-core.mjs";
import {
  kodyCapabilityFailure,
  kodyCapabilitySuccess,
} from "../../scripts/release-mcp-production.mjs";

const requiredEnv = {
  VERCEL_TOKEN: "vercel-test-token",
  VERCEL_SCOPE: "aguy",
  KODY_MCP_TEST_CONVEX_URL: "https://example.convex.cloud",
  E2E_GITHUB_TOKEN: "github-test-token",
  E2E_GITHUB_REPO: "owner/repo",
  KODY_SERVICE_KEY: "service-test-key",
};

describe("MCP production release gate", () => {
  it("promotes only after the complete MCP and browser gates pass", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: "https://kody-dashboard-candidate.vercel.app\n",
      })
      .mockResolvedValue({ stdout: "" });

    await runMcpProductionRelease({ env: requiredEnv, run, repoRoot: "/repo" });

    expect(run.mock.calls.map(([command]) => command.label)).toEqual([
      "stage production candidate",
      "full production MCP gate",
      "deployed Activity and Todo gate",
      "promote verified candidate",
      "verify stable MCP endpoint",
    ]);
    expect(run.mock.calls[3]?.[0].args).toContain(
      "https://kody-dashboard-candidate.vercel.app",
    );
    for (const index of [0, 3]) {
      expect(run.mock.calls[index]?.[0].args).toContain("--scope");
      expect(run.mock.calls[index]?.[0].args).toContain("aguy");
    }
    expect(run.mock.calls.every(([command]) => command.cwd === "/repo")).toBe(
      true,
    );
  });

  it("does not promote when the MCP gate fails", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: "https://kody-dashboard-candidate.vercel.app\n",
      })
      .mockRejectedValueOnce(new Error("MCP gate failed"));

    await expect(
      runMcpProductionRelease({ env: requiredEnv, run, repoRoot: "/repo" }),
    ).rejects.toThrow("MCP gate failed");

    expect(
      run.mock.calls.some(([command]) => command.args.includes("promote")),
    ).toBe(false);
  });

  it("stops before deployment when release credentials are missing", async () => {
    const run = vi.fn();

    await expect(
      runMcpProductionRelease({ env: {}, run, repoRoot: "/repo" }),
    ).rejects.toThrow("Missing required release environment");
    expect(run).not.toHaveBeenCalled();
  });

  it.each([
    "Vercel returned no URL",
    "https://kody-dashboard-khaki.vercel.app\n",
  ])("does not test or promote an unidentified candidate", async (stdout) => {
    const run = vi.fn().mockResolvedValueOnce({ stdout });

    await expect(
      runMcpProductionRelease({ env: requiredEnv, run, repoRoot: "/repo" }),
    ).rejects.toThrow("Vercel did not return a candidate URL");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("returns inspectable Kody evidence without raw command output", () => {
    expect(
      kodyCapabilitySuccess({
        deploymentUrl: "https://candidate.vercel.app",
        endpoint: "https://stable.example/api/kody/mcp",
      }),
    ).toEqual({
      version: 1,
      status: "pass",
      summary: "Dashboard candidate passed every gate and was promoted.",
      evidence: { productionDeployed: true },
      facts: {
        productionDeploymentUrl: "https://candidate.vercel.app",
        mcpEndpoint: "https://stable.example/api/kody/mcp",
      },
      artifacts: [
        {
          label: "Vercel deployment",
          url: "https://candidate.vercel.app",
        },
      ],
      missingEvidence: [],
      blockers: [],
    });
  });

  it("returns a safe Kody failure without exposing the underlying error", () => {
    const error = new Error("failed with private-vercel-token");
    Object.assign(error, { releaseStage: "stage production candidate" });
    const result = kodyCapabilityFailure(error);

    expect(result.status).toBe("fail");
    expect(JSON.stringify(result)).not.toContain("private-vercel-token");
    expect(result.facts).toEqual({
      failedStage: "stage production candidate",
    });
    expect(result.summary).toContain("stage production candidate");
    expect(result.evidence).toEqual({});
    expect(result.missingEvidence).toEqual(["productionDeployed"]);
  });
});

import { describe, expect, it, vi } from "vitest";
import { runMcpProductionRelease } from "../../scripts/release-mcp-production-core.mjs";

const requiredEnv = {
  VERCEL_TOKEN: "vercel-test-token",
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
      run.mock.calls.some(([command]) =>
        command.args.includes("promote"),
      ),
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
});

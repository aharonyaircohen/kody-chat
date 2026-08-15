import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(process.cwd(), "../..");

describe("kody-chat company activation", () => {
  it("identifies this repo as its own Kody company", () => {
    const config = JSON.parse(
      readFileSync(resolve(repoRoot, "kody.config.json"), "utf8"),
    );

    expect(config.github).toEqual({
      owner: "aharonyaircohen",
      repo: "kody-chat",
      operators: ["aguyaharonyair", "aharonyaircohen"],
    });
    expect(config).not.toHaveProperty("state");
  });

  it("activates CI repair, quality, the installed memory agency, and release workflows", () => {
    const config = JSON.parse(
      readFileSync(resolve(repoRoot, "kody.config.json"), "utf8"),
    );

    expect(config.company.activeAgents).toEqual([
      "kody",
      "memory-steward",
      "qa",
    ]);
    expect(config.company.activeCapabilities).toEqual([
      "ci-health-check",
      "review",
      "fix",
      "merge",
      "extract-run-learning",
      "detect-memory-duplicates",
      "detect-memory-conflicts",
      "decide-memory-change",
      "apply-memory-changes",
      "verify-memory-change",
      "detect-stale-memory",
      "release-prepare",
      "release-validate",
      "ui-review",
      "prepare-ci-repair",
      "quality-check",
      "fix-ci",
      "run",
      "finalize-ci-repair",
      "prepare-strategy-application",
      "apply-strategy",
      "qa-engineer",
      "verify-strategy-application",
      "release-merge",
      "release-promote",
      "vercel-production-deploy",
    ]);
    expect(config.company.activeWorkflows).toEqual([
      "ci-repair",
      "learn-from-runs",
      "maintain-memory-quality",
      "merge",
      "review-fix",
      "quality-run",
      "apply-strategy",
      "qa-scan",
      "web-release",
    ]);
    expect(config.defaultImplementation).toBe("run");
    expect(config.defaultPrImplementation).toBe("fix");
    expect(config.company.activeCapabilities).toContain("run");
    expect(config).not.toHaveProperty("defaultExecutable");
    expect(config).not.toHaveProperty("defaultPrExecutable");
  });

  it("ships the standard root workflow with a 15-minute scheduler wake", () => {
    const workflow = readFileSync(
      resolve(repoRoot, ".github/workflows/kody.yml"),
      "utf8",
    );

    expect(workflow).toMatch(/cron: ["'](?:\*|\d+)\/15 \* \* \* \*["']/);
    expect(workflow).toContain("@kody-ade/kody-engine@latest");
  });

  it("runs full QA separately from read-only production smoke", () => {
    const qaLoop = JSON.parse(
      readFileSync(
        resolve(
          repoRoot,
          ".kody-engine/definitions/loops/hourly-qa-scan/loop.json",
        ),
        "utf8",
      ),
    );
    const productionLoop = JSON.parse(
      readFileSync(
        resolve(
          repoRoot,
          ".kody-engine/definitions/loops/hourly-production-qa-smoke/loop.json",
        ),
        "utf8",
      ),
    );

    expect(qaLoop.target).toEqual({ kind: "workflow", id: "qa-scan" });
    expect(qaLoop.input).toMatchObject({
      mode: "test",
      url: expect.stringContaining("kody-dashboard-qa.vercel.app"),
    });
    expect(productionLoop.target).toEqual({
      kind: "workflow",
      id: "qa-scan",
    });
    expect(productionLoop.input).toMatchObject({
      mode: "read-only",
      url: expect.stringContaining("kody-dashboard-khaki.vercel.app"),
    });
  });
});

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(root, path), "utf8")) as T;
}

function readText(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("grouped agentResponsibility config", () => {
  it("groups hourly delivery graph agentResponsibilities behind one agentAction", () => {
    const agentResponsibility = readJson<{
      agentAction: string;
      agentActions?: string[];
      every: string;
      writesTo: string[];
    }>(".kody/agent-responsibilities/delivery-graph/profile.json");
    const profile = readJson<{
      claudeCode: { skills: string[] };
      scripts: { preflight: Array<{ script?: string; shell?: string }> };
    }>(".kody/agent-actions/delivery-graph/profile.json");

    expect(agentResponsibility.agentAction).toBe("delivery-graph");
    expect(agentResponsibility.agentActions).toBeUndefined();
    expect(agentResponsibility.every).toBe("1h");
    expect(agentResponsibility.writesTo).toEqual(["ci-health-graph", "pr-graph"]);
    expect(profile.claudeCode.skills).toEqual(["ci-health-graph", "pr-graph"]);
    expect(profile.scripts.preflight).toEqual([
      { script: "buildSyntheticPlugin" },
      { shell: "refresh-delivery-graphs.sh" },
      { script: "skipAgent" },
    ]);
    expect(readText(".kody/agent-actions/delivery-graph/prompt.md")).toContain(
      "skips the agent",
    );
  });

  it("groups daily repo graph agentResponsibilities behind one agentAction", () => {
    const agentResponsibility = readJson<{
      agentAction: string;
      agentActions?: string[];
      every: string;
      writesTo: string[];
    }>(".kody/agent-responsibilities/repo-graph/profile.json");
    const profile = readJson<{
      claudeCode: { skills: string[] };
      scripts: { preflight: Array<{ script?: string; shell?: string }> };
    }>(".kody/agent-actions/repo-graph/profile.json");

    expect(agentResponsibility.agentAction).toBe("repo-graph");
    expect(agentResponsibility.agentActions).toBeUndefined();
    expect(agentResponsibility.every).toBe("1d");
    expect(agentResponsibility.writesTo).toEqual(["dependency-graph", "docs-graph"]);
    expect(profile.claudeCode.skills).toEqual([
      "dependency-graph",
      "docs-graph",
    ]);
    expect(profile.scripts.preflight).toEqual([
      { script: "buildSyntheticPlugin" },
      { shell: "refresh-repo-graphs.sh" },
      { script: "skipAgent" },
    ]);
  });

  it("groups docs drift and code coverage behind one docs health agentResponsibility", () => {
    const agentResponsibility = readJson<{
      agentAction: string;
      agentActions?: string[];
      every: string;
      mentions: string[];
    }>(".kody/agent-responsibilities/docs-health/profile.json");
    const profile = readJson<{
      claudeCode: { skills: string[] };
      scripts: { preflight: Array<{ script?: string }> };
    }>(".kody/agent-actions/docs-health/profile.json");

    expect(agentResponsibility.agentAction).toBe("docs-health");
    expect(agentResponsibility.agentActions).toBeUndefined();
    expect(agentResponsibility.every).toBe("1d");
    expect(agentResponsibility.mentions).toEqual(["aguyaharonyair"]);
    expect(profile.claudeCode.skills).toEqual(["docs-readme", "docs-code"]);
    expect(profile.scripts.preflight).toEqual([
      { script: "buildSyntheticPlugin" },
      { script: "composePrompt" },
    ]);
  });

  it("groups disabled daily quality watches behind one agentAction", () => {
    const agentResponsibility = readJson<{
      agentAction: string;
      every: string;
      runner: string;
      disabled: boolean;
    }>(".kody/agent-responsibilities/quality-watch/profile.json");
    const profile = readJson<{
      claudeCode: { skills: string[] };
      output: { actionTypes: string[] };
    }>(".kody/agent-actions/quality-watch/profile.json");

    expect(agentResponsibility).toMatchObject({
      agentAction: "quality-watch",
      every: "1d",
      runner: "cto",
      disabled: true,
    });
    expect(profile.claudeCode.skills).toEqual([
      "security-audit",
      "coverage-floor",
      "flaky-test-quarantine",
    ]);
    expect(profile.output.actionTypes).toContain("QUALITY_WATCH_COMPLETED");
  });

  it("groups disabled weekly code-health watches behind one agentAction", () => {
    const agentResponsibility = readJson<{
      agentAction: string;
      every: string;
      runner: string;
      disabled: boolean;
    }>(".kody/agent-responsibilities/code-health/profile.json");
    const profile = readJson<{
      claudeCode: { skills: string[] };
      output: { actionTypes: string[] };
    }>(".kody/agent-actions/code-health/profile.json");

    expect(agentResponsibility).toMatchObject({
      agentAction: "code-health",
      every: "7d",
      runner: "cto",
      disabled: true,
    });
    expect(profile.claudeCode.skills).toEqual([
      "architecture-audit",
      "type-debt",
    ]);
    expect(profile.output.actionTypes).toContain("CODE_HEALTH_COMPLETED");
  });

  it("groups disabled cleanup watches behind one agentAction", () => {
    const agentResponsibility = readJson<{
      agentAction: string;
      every: string;
      runner: string;
      disabled: boolean;
    }>(".kody/agent-responsibilities/cleanup/profile.json");
    const profile = readJson<{
      claudeCode: { skills: string[] };
      output: { actionTypes: string[] };
    }>(".kody/agent-actions/cleanup/profile.json");

    expect(agentResponsibility).toMatchObject({
      agentAction: "cleanup",
      every: "1d",
      runner: "coo",
      disabled: true,
    });
    expect(profile.claudeCode.skills).toEqual([
      "clear-empty-goals",
      "cleanup-branches",
      "dependency-bump",
      "dead-code-sweep",
    ]);
    expect(profile.output.actionTypes).toContain("CLEANUP_COMPLETED");
  });

  it("removes the individual scheduled agentResponsibility folders that are now grouped", () => {
    for (const slug of [
      "ci-health-graph",
      "pr-graph",
      "dependency-graph",
      "docs-graph",
      "docs-code",
      "docs-readme",
      "security-audit",
      "coverage-floor",
      "flaky-test-quarantine",
      "architecture-audit",
      "type-debt",
      "dead-code-sweep",
      "dependency-bump",
      "test-ex",
      "chain-test",
      "inbox-ping",
      "publish-release",
      "cleanup-branches",
      "clear-empty-goals",
      "repo-maintenance",
    ]) {
      expect(existsSync(join(root, `.kody/agent-responsibilities/${slug}/profile.json`))).toBe(
        false,
      );
      expect(existsSync(join(root, `.kody/agent-responsibilities/${slug}/agent-responsibility.md`))).toBe(
        false,
      );
    }
  });

  it("removes retired diagnostic and redundant agentActions", () => {
    for (const slug of [
      "inbox-ping",
      "publish-release",
      "noop-1",
      "noop-2",
      "cleanup-branches",
      "clear-empty-goals",
      "repo-maintenance",
    ]) {
      expect(
        existsSync(join(root, `.kody/agent-actions/${slug}/profile.json`)),
      ).toBe(false);
    }

    const publishCommand = readText(".kody/commands/publish.md");
    expect(publishCommand).toContain("consolidated `release` agentAction");
    expect(publishCommand).toContain("removed `publish-release` agentResponsibility");
  });
});

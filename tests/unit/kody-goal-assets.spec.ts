import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("Kody goal and agentResponsibility assets", () => {
  it("keeps issue-bound task agentResponsibilities manual-only", () => {
    const leader = readJson(".kody/agent-responsibilities/task-leader/profile.json");
    const verifier = readJson(".kody/agent-responsibilities/task-verifier/profile.json");

    expect(leader).toMatchObject({ agentAction: "task-leader", every: "manual" });
    expect(verifier).toMatchObject({ agentAction: "task-verifier", every: "manual" });
  });

  it("routes the hourly monitor into company-graph with goal context", () => {
    const template = readJson(".kody/goals/templates/hourly-monitor-goal-smoke/state.json");
    const route = template.route as Array<Record<string, unknown>>;

    expect(template).toMatchObject({
      type: "monitor",
      destination: { evidence: ["companyGraphRefreshed"] },
    });
    expect(route[0]).toMatchObject({
      evidence: "companyGraphRefreshed",
      agentResponsibility: "company-graph",
      agentAction: "company-graph",
      args: { goal: { fact: "goalId" } },
    });
  });


  it("keeps a reusable five-minute recurring smoke template", () => {
    const template = readJson(".kody/goals/templates/five-minute-goal-smoke/state.json");
    const route = template.route as Array<Record<string, unknown>>;

    expect(template).toMatchObject({
      kind: "template",
      templateId: "five-minute-goal-smoke",
      type: "monitor",
      destination: { evidence: ["companyGraphRefreshed"] },
    });
    expect(route[0]).toMatchObject({
      evidence: "companyGraphRefreshed",
      agentResponsibility: "company-graph",
      agentAction: "company-graph",
      args: { goal: { fact: "goalId" } },
    });
  });

  it("lets company-graph report goal evidence after refresh", () => {
    const profile = readJson(".kody/agent-actions/company-graph/profile.json");
    const script = readFileSync(".kody/agent-actions/company-graph/refresh-company-graph.sh", "utf8");
    const syntax = spawnSync("bash", ["-n", ".kody/agent-actions/company-graph/refresh-company-graph.sh"], {
      encoding: "utf8",
    });

    expect(syntax.status).toBe(0);
    expect(profile).toMatchObject({
      inputs: [{ name: "goal", flag: "--goal", required: false }],
      scripts: { postflight: [{ script: "applyAgentResponsibilityReports" }] },
    });
    expect(script).toContain("KODY_ARG_GOAL");
    expect(script).toContain("KODY_AGENT_RESPONSIBILITY_REPORT=");
    expect(script).toContain('"companyGraphRefreshed":true');
    expect(script).toContain("gh api -X PUT");
    expect(script).toContain('--input "$payload_file"');
  });
});

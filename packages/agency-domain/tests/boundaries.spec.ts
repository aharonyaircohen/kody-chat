import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertLifecycleTransition,
  createAgentDefinition,
  createPolicy,
  deletionIssues,
  createIntentDefinition,
  createOperationDefinition,
  createWorkflowDefinition,
} from "../src/index";

describe("domain responsibility boundaries", () => {
  it("has no runtime dependencies or infrastructure imports", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"),
    );
    const source = readFileSync(
      resolve(import.meta.dirname, "../src/index.ts"),
      "utf8",
    );
    expect(pkg.dependencies).toBeUndefined();
    expect(source).not.toMatch(
      /from ["'](?:convex|next|@octokit|@kody-ade\/backend)/,
    );
  });

  it("keeps orchestration only in Workflow", () => {
    expect(
      createWorkflowDefinition({
        id: "refresh-knowledge",
        steps: [
          {
            id: "build",
            capabilityRef: { kind: "capability", id: "build-knowledge-graph" },
          },
          {
            id: "publish",
            capabilityRef: { kind: "capability", id: "publish-report" },
            dependsOn: ["build"],
            input: { report: { fromStep: "build" } },
            condition: "build.succeeded",
            retry: { maxAttempts: 3, backoffSeconds: 30 },
          },
        ],
      }),
    ).toMatchObject({ steps: [{ id: "build" }, { id: "publish" }] });
  });

  it("keeps ownership links off Intent and derived collections off Operation", () => {
    expect(() =>
      createIntentDefinition({
        id: "quality",
        direction: "Keep delivery trustworthy",
        priorities: ["evidence"],
        policy: policy(),
        constraints: [],
        goals: ["refresh-graph"],
      }),
    ).toThrow(/goals/);
    expect(() =>
      createOperationDefinition({
        id: "knowledge",
        name: "Knowledge",
        responsibility: "Keep project knowledge current",
        intentIds: ["quality"],
        goals: ["refresh-graph"],
      }),
    ).toThrow(/goals/);
  });

  it("keeps policy and agent judgment typed without execution ownership", () => {
    expect(createPolicy(policy())).toMatchObject({
      approval: "risky-actions",
      maxConcurrentRuns: 2,
    });
    expect(
      createAgentDefinition({
        id: "developer",
        name: "Developer",
        role: "Implement approved work",
        permissions: ["code.write"],
        constraints: [
          {
            id: "protect-main",
            rule: "Do not force-push",
            actions: ["git.force-push"],
            effect: "deny",
          },
        ],
      }),
    ).toMatchObject({ id: "developer", permissions: ["code.write"] });
    expect(() =>
      createAgentDefinition({
        id: "developer",
        name: "Developer",
        role: "Implement approved work",
        permissions: ["code.write"],
        constraints: [],
        workflow: "release",
      }),
    ).toThrow(/workflow/);
  });

  it("allows only explicit lifecycle transitions", () => {
    expect(() => assertLifecycleTransition("active", "archived")).toThrow();
    expect(assertLifecycleTransition("active", "paused")).toBe("paused");
    expect(assertLifecycleTransition("retired", "archived")).toBe("archived");
  });

  it("protects referenced definitions from deletion", () => {
    expect(
      deletionIssues({ kind: "workflow", id: "refresh-knowledge" }, [
        {
          owner: { kind: "goal", id: "refresh-graph" },
          field: "executionRef",
          target: { kind: "workflow", id: "refresh-knowledge" },
        },
      ]),
    ).toEqual(['Referenced by Goal "refresh-graph" through executionRef']);
  });
});

function policy() {
  return {
    approval: "risky-actions",
    authority: { allow: ["code.write"], deny: ["production.delete"] },
    budget: {
      maxRuns: 10,
      maxTokens: 100000,
      maxCostUsd: 100,
      maxDurationSeconds: 3600,
    },
    maxConcurrentRuns: 2,
    riskyActions: ["production.deploy"],
  };
}

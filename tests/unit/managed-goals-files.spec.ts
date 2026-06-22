/** @fileoverview Unit tests for managed goal GitHub file helpers. */
import { describe, expect, it, vi } from "vitest";

import { readManagedGoalFile } from "../../src/dashboard/lib/managed-goals-files";

describe("readManagedGoalFile", () => {
  it("normalizes engine-written null agentResponsibilities", async () => {
    const octokit = {
      rest: {
        repos: {
          getContent: vi.fn(async () => ({
            data: {
              type: "file",
              sha: "goal-sha",
              content: Buffer.from(
                JSON.stringify({
                  version: 1,
                  state: "active",
                  type: "improve",
                  destination: {
                    outcome: "Goal creation works.",
                    evidence: ["planReady"],
                  },
                  agentResponsibilities: null,
                  route: [
                    {
                      stage: "plan",
                      evidence: "planReady",
                      agentResponsibility: "plan",
                    },
                  ],
                  facts: {},
                  blockers: [],
                }),
                "utf8",
              ).toString("base64"),
              encoding: "base64",
            },
          })),
        },
      },
    };

    const file = await readManagedGoalFile(
      "goal-creation-works",
      octokit as never,
      "test-owner",
      "test-repo",
    );

    expect(file?.sha).toBe("goal-sha");
    expect(file?.state.agentResponsibilities).toEqual(["plan"]);
  });
});

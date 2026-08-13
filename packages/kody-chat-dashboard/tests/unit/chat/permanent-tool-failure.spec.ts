import { describe, expect, it } from "vitest";

import {
  findPermanentToolFailure,
  formatPermanentToolFailure,
} from "../../../src/dashboard/lib/chat/core/permanent-tool-failure";

describe("permanent tool failure policy", () => {
  it("stops on a 4xx result and preserves exact validation details", () => {
    const failure = findPermanentToolFailure([
      {
        toolResults: [
          {
            toolName: "run_workflow",
            output: {
              error: "invalid_workflow",
              status: 409,
              message: "Workflow is invalid and was not dispatched.",
              issues: [
                {
                  code: "missing_transition_target",
                  path: "steps[1].next[0].to",
                  message: "Step check connects to missing step repair.",
                },
              ],
            },
          },
        ],
      },
    ]);

    expect(failure).toMatchObject({
      toolName: "run_workflow",
      error: "invalid_workflow",
      status: 409,
    });
    expect(formatPermanentToolFailure(failure!)).toContain(
      "steps[1].next[0].to: Step check connects to missing step repair. [missing_transition_target]",
    );
  });

  it("does not stop for retryable server failures or approval", () => {
    expect(
      findPermanentToolFailure([
        { toolResults: [{ toolName: "run_workflow", output: { error: "upstream", status: 503 } }] },
      ]),
    ).toBeNull();
    expect(
      findPermanentToolFailure([
        { toolResults: [{ toolName: "run_workflow", output: { error: "approval_required", status: 409 } }] },
      ]),
    ).toBeNull();
  });
});

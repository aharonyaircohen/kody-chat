import { describe, expect, it } from "vitest";
import {
  buildPipelineDefinition,
  resolvePipelineStepInput,
  validatePipelineDefinition,
} from "../../src/dashboard/lib/pipeline-definitions";

describe("Pipeline definitions", () => {
  it("keeps Pipeline steps limited to Workflow references", () => {
    const pipeline = buildPipelineDefinition({
      name: "Review then merge",
      steps: [
        { id: "review", workflow: "review-merge" },
        { id: "merge", workflow: "merge" },
      ],
    });

    expect(
      validatePipelineDefinition(pipeline, {
        knownWorkflows: new Set(["review-merge", "merge"]),
      }),
    ).toEqual([]);
  });

  it("rejects duplicate steps and missing Workflows", () => {
    const pipeline = buildPipelineDefinition({
      name: "Broken",
      steps: [
        { id: "same", workflow: "review-merge" },
        { id: "same", workflow: "missing" },
      ],
    });

    expect(
      validatePipelineDefinition(pipeline, {
        knownWorkflows: new Set(["review-merge"]),
      }).map((issue) => issue.code),
    ).toEqual(["duplicate_step_id", "unknown_workflow"]);
  });

  it("maps Pipeline and previous Workflow values into the next Workflow", () => {
    expect(
      resolvePipelineStepInput({
        step: {
          id: "merge",
          workflow: "merge",
          inputMap: { pr: "previous.pr", headSha: "input.headSha" },
        },
        pipelineInput: { headSha: "abcdef1" },
        previousOutput: { pr: 42 },
      }),
    ).toEqual({ pr: 42, headSha: "abcdef1" });
  });
});

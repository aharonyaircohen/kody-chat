import { describe, expect, it } from "vitest";

import { wireSingleCapabilityInputs } from "@dashboard/lib/workflow-capability-inputs";
import type { WorkflowDefinition } from "@dashboard/lib/workflow-definitions";

const workflow: WorkflowDefinition = {
  name: "Import source",
  agent: "kody",
  capabilities: ["import-source"],
  startAt: "import-source",
  steps: [{ id: "import-source", capability: "import-source" }],
  createdAt: "2026-08-22T00:00:00.000Z",
  updatedAt: "2026-08-22T00:00:00.000Z",
};

describe("single-capability workflow inputs", () => {
  it("uses the capability contract as the workflow form and field mappings", () => {
    const result = wireSingleCapabilityInputs(
      workflow,
      JSON.stringify({
        input: {
          type: "object",
          additionalProperties: false,
          properties: {
            sourceId: { type: "string", title: "Source" },
            title: { type: "string" },
          },
          required: ["sourceId", "title"],
        },
        output: { type: "object" },
      }),
    );

    expect(result.inputSchema).toMatchObject({
      type: "object",
      required: ["sourceId", "title"],
    });
    expect(result.steps?.[0]?.inputs).toEqual({
      sourceId: { from: "workflow.input.sourceId" },
      title: { from: "workflow.input.title" },
    });
  });

  it("does not guess mappings for a multi-step workflow", () => {
    const result = wireSingleCapabilityInputs(
      {
        ...workflow,
        capabilities: ["inspect", "import-source"],
        steps: [
          { id: "inspect", capability: "inspect" },
          { id: "import-source", capability: "import-source" },
        ],
      },
      JSON.stringify({
        input: {
          type: "object",
          properties: { sourceId: { type: "string" } },
        },
      }),
    );

    expect(result.inputSchema).toBeUndefined();
    expect(result.steps?.[1]?.inputs).toBeUndefined();
  });
});

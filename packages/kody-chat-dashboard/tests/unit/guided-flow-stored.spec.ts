import { describe, expect, it } from "vitest";

import { parseGuidedFlowDefinitionRows } from "../../src/dashboard/lib/guided-flows/stored";

function definition(title: string) {
  return {
    id: "shared-flow",
    version: 1,
    title,
    steps: [
      {
        id: "step-1",
        title: "Step",
        explanation: "Continue.",
        rendererSlug: "approval-card",
      },
    ],
  };
}

describe("stored guided flow definitions", () => {
  it("preserves supported optional controls", () => {
    expect(
      parseGuidedFlowDefinitionRows([
        {
          flowId: "shared-flow",
          version: 1,
          updatedAt: "2026-01-01T00:00:00.000Z",
          definition: { ...definition("Repository"), controls: ["back"] },
        },
      ]),
    ).toEqual([expect.objectContaining({ controls: ["back"] })]);
  });

  it("rejects unknown controls at the storage boundary", () => {
    expect(
      parseGuidedFlowDefinitionRows([
        {
          flowId: "shared-flow",
          version: 1,
          updatedAt: "2026-01-01T00:00:00.000Z",
          definition: { ...definition("Repository"), controls: ["delete-all"] },
        },
      ]),
    ).toEqual([]);
  });

  it("rejects duplicate controls at the storage boundary", () => {
    expect(
      parseGuidedFlowDefinitionRows([
        {
          flowId: "shared-flow",
          version: 1,
          updatedAt: "2026-01-01T00:00:00.000Z",
          definition: {
            ...definition("Repository"),
            controls: ["back", "back"],
          },
        },
      ]),
    ).toEqual([]);
  });

  it("prefers a repository-owned row over a legacy actor row", () => {
    expect(
      parseGuidedFlowDefinitionRows([
        {
          actorId: "alice",
          flowId: "shared-flow",
          version: 1,
          updatedAt: "2026-01-02T00:00:00.000Z",
          definition: definition("Legacy"),
        },
        {
          flowId: "shared-flow",
          version: 1,
          updatedAt: "2026-01-01T00:00:00.000Z",
          definition: definition("Repository"),
        },
      ]),
    ).toEqual([expect.objectContaining({ title: "Repository" })]);
  });

  it("uses the newest legacy row until the repository republishes it", () => {
    expect(
      parseGuidedFlowDefinitionRows([
        {
          actorId: "alice",
          flowId: "shared-flow",
          version: 1,
          updatedAt: "2026-01-01T00:00:00.000Z",
          definition: definition("Older"),
        },
        {
          actorId: "bob",
          flowId: "shared-flow",
          version: 1,
          updatedAt: "2026-01-02T00:00:00.000Z",
          definition: definition("Newer"),
        },
      ]),
    ).toEqual([expect.objectContaining({ title: "Newer" })]);
  });
});

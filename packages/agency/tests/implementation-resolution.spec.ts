import { describe, expect, it } from "vitest";

import { resolveCapabilityImplementations } from "../src/implementation-resolution";
import type { StoredAgencyDefinition } from "../src/backend/agency-model-store";

function record(
  kind: StoredAgencyDefinition["kind"],
  id: string,
  data: StoredAgencyDefinition["data"],
): StoredAgencyDefinition {
  return {
    recordId: `${kind}:${id}:revision`,
    kind,
    schemaVersion: 1,
    data,
    createdAt: "2026-07-23T00:00:00.000Z",
  };
}

describe("Capability Implementation resolution", () => {
  it("selects the only compatible current Implementation", () => {
    const result = resolveCapabilityImplementations(
      [
        record("capability", "build-graph", { id: "build-graph" }),
        record("implementation", "graphify", {
          id: "graphify",
          capabilityRef: { kind: "capability", id: "build-graph" },
          compatibleCapabilityRevision: "revision",
          type: "script",
        }),
      ],
      "build-graph",
    );

    expect(result.status).toBe("resolved");
    expect(result.selected?.data.id).toBe("graphify");
  });

  it("fails closed when several compatible Implementations exist", () => {
    const result = resolveCapabilityImplementations(
      [
        record("capability", "build-graph", { id: "build-graph" }),
        record("implementation", "graphify", {
          id: "graphify",
          capabilityRef: { kind: "capability", id: "build-graph" },
          compatibleCapabilityRevision: "revision",
          type: "script",
        }),
        record("implementation", "other", {
          id: "other",
          capabilityRef: { kind: "capability", id: "build-graph" },
          compatibleCapabilityRevision: "revision",
          type: "script",
        }),
      ],
      "build-graph",
    );

    expect(result.status).toBe("ambiguous");
    expect(result.selected).toBeUndefined();
    expect(result.candidates.map((candidate) => candidate.data.id)).toEqual([
      "graphify",
      "other",
    ]);
  });

  it("uses an explicit repository binding to resolve ambiguity", () => {
    const records = [
      record("capability", "build-graph", { id: "build-graph" }),
      record("implementation", "graphify", {
        id: "graphify",
        capabilityRef: { kind: "capability", id: "build-graph" },
        compatibleCapabilityRevision: "revision",
        type: "script",
      }),
      record("implementation", "other", {
        id: "other",
        capabilityRef: { kind: "capability", id: "build-graph" },
        compatibleCapabilityRevision: "revision",
        type: "script",
      }),
    ];

    expect(
      resolveCapabilityImplementations(records, "build-graph", "graphify")
        .selected?.data.id,
    ).toBe("graphify");
  });
});

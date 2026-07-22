import { describe, expect, it } from "vitest";
import {
  decodeAgencyDefinition,
  encodeAgencyDefinition,
} from "../../src/agency-domain-codec";

describe("agency domain persistence codec", () => {
  it("keeps schema metadata in the envelope and out of the domain entity", () => {
    const envelope = encodeAgencyDefinition("goal", "goal-record-1", {
      id: "refresh-graph",
      operationId: "knowledge",
      objective: {
        desiredState: "The graph is current",
        requiredEvidence: ["graph-published"],
          scope: { include: { repository: ["acme/app"] }, exclude: {} },
      },
      executionRef: { kind: "workflow", id: "refresh-knowledge" },
    });

    expect(envelope).toMatchObject({
      schemaVersion: 1,
      recordId: "goal-record-1",
    });
    expect(envelope.data).not.toHaveProperty("version");
    expect(decodeAgencyDefinition(envelope)).toEqual(envelope.data);
  });

  it("rejects unsupported envelopes before they reach the domain", () => {
    expect(() =>
      decodeAgencyDefinition({
        schemaVersion: 99,
        recordId: "goal-record-1",
        kind: "goal",
        data: {},
      }),
    ).toThrow(/schema version/i);
  });
});

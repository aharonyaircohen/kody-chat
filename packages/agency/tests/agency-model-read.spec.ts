import { describe, expect, it } from "vitest";

import {
  currentAgencyDefinition,
  currentAgencyDefinitions,
  currentAgencyState,
  operationReadiness,
} from "../src/agency-model-read";
import type {
  StoredAgencyDefinition,
  StoredAgencyState,
} from "../src/backend/agency-model-store";

const definitions: StoredAgencyDefinition[] = [
  {
    recordId: "intent:quality:old",
    kind: "intent",
    schemaVersion: 1,
    data: { id: "quality", direction: "Old" },
    createdAt: "2026-07-01T00:00:00.000Z",
  },
  {
    recordId: "intent:quality:new",
    kind: "intent",
    schemaVersion: 1,
    data: { id: "quality", direction: "New" },
    createdAt: "2026-07-02T00:00:00.000Z",
  },
  {
    recordId: "operation:delivery:current",
    kind: "operation",
    schemaVersion: 1,
    data: {
      id: "delivery",
      name: "Delivery",
      responsibility: "Ship",
      doesNotOwn: [],
      intentIds: ["quality"],
    },
    createdAt: "2026-07-02T00:00:00.000Z",
  },
  {
    recordId: "goal:release:current",
    kind: "goal",
    schemaVersion: 1,
    data: {
      id: "release",
      operationId: "delivery",
      objective: {
        desiredState: "Released",
        requiredEvidence: [],
        scope: { include: {}, exclude: {} },
      },
      executionRef: { kind: "capability", id: "release" },
    },
    createdAt: "2026-07-02T00:00:00.000Z",
  },
];

const states: StoredAgencyState[] = [
  {
    definitionId: "delivery",
    kind: "operation",
    schemaVersion: 1,
    data: {
      definitionId: "delivery",
      lifecycle: "active",
      updatedAt: "2026-07-02T00:00:00.000Z",
    },
    updatedAt: "2026-07-02T00:00:00.000Z",
  },
];

describe("current Agency model reads", () => {
  it("returns only the newest immutable revision for each model id", () => {
    expect(currentAgencyDefinitions(definitions)).toHaveLength(3);
    expect(
      currentAgencyDefinition(definitions, "intent", "quality")?.data,
    ).toMatchObject({ direction: "New" });
  });

  it("finds mutable state by kind and definition id", () => {
    expect(currentAgencyState(states, "operation", "delivery")?.data).toEqual(
      states[0]!.data,
    );
  });

  it("derives Operation scope from Goal and Loop ownership", () => {
    expect(operationReadiness(definitions, states, "delivery")).toEqual({
      operation: expect.objectContaining({ id: "delivery" }),
      goals: ["release"],
      loops: [],
      issues: [],
    });
  });

  it("reports inactive Operations and missing Intent references", () => {
    const result = operationReadiness(
      definitions.filter(
        (record) => !(record.kind === "intent" && record.data.id === "quality"),
      ),
      states.map((state) => ({
        ...state,
        data: { ...state.data, lifecycle: "paused" },
      })),
      "delivery",
    );
    expect(result.issues).toEqual([
      "Operation is not active",
      'Missing Intent "quality"',
    ]);
  });
});

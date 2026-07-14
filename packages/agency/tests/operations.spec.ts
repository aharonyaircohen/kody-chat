/**
 * @fileoverview Unit tests for the minimal AI Agency Operation contract.
 * @testFramework vitest
 * @domain agency-operations
 */

import { describe, expect, it } from "vitest";

import {
  buildOperation,
  canActivateOperation,
  operationActivationIssues,
  operationPath,
  operationOwnershipIssues,
  parseOperation,
  slugifyOperationId,
} from "../src/operations";

describe("Operation contract", () => {
  it("parses the minimal responsibility boundary", () => {
    const operation = parseOperation("operations/release/operation.json", {
      version: 1,
      id: "release",
      name: " Release ",
      responsibility: " Ship approved changes safely. ",
      doesNotOwn: ["Product priorities", " Product priorities "],
      intentIds: ["reliable-delivery", "reliable-delivery"],
      goals: ["web-release", "web-release"],
      loops: ["deployment-health"],
      status: "provisioning",
      createdAt: "2026-07-14T10:00:00.000Z",
      updatedAt: "2026-07-14T10:05:00.000Z",
    });

    expect(operation).toEqual({
      version: 1,
      id: "release",
      name: "Release",
      responsibility: "Ship approved changes safely.",
      doesNotOwn: ["Product priorities"],
      intentIds: ["reliable-delivery"],
      goals: ["web-release"],
      loops: ["deployment-health"],
      status: "provisioning",
      createdAt: "2026-07-14T10:00:00.000Z",
      updatedAt: "2026-07-14T10:05:00.000Z",
    });
  });

  it("builds a proposed Operation with stable timestamps", () => {
    const operation = buildOperation(
      {
        id: "release",
        name: "Release",
        responsibility: "Ship approved changes safely.",
        doesNotOwn: ["Product priority"],
        intentIds: ["reliable-delivery"],
        goals: [],
        loops: [],
      },
      "2026-07-14T10:00:00.000Z",
    );

    expect(operation.status).toBe("proposed");
    expect(operation.createdAt).toBe("2026-07-14T10:00:00.000Z");
    expect(operation.updatedAt).toBe("2026-07-14T10:00:00.000Z");
  });

  it("rejects an Operation without a clear responsibility boundary", () => {
    expect(() =>
      buildOperation({
        id: "release",
        name: "Release",
        responsibility: "",
        doesNotOwn: [],
        intentIds: ["reliable-delivery"],
        goals: [],
        loops: [],
      }),
    ).toThrow("Operation responsibility is required");

    expect(() =>
      buildOperation({
        id: "release",
        name: "Release",
        responsibility: "Ship approved changes safely.",
        doesNotOwn: [],
        intentIds: ["reliable-delivery"],
        goals: [],
        loops: [],
      }),
    ).toThrow("Operation must define what it does not own");
  });

  it("rejects an Operation that has no Intent justification", () => {
    expect(() =>
      buildOperation({
        id: "release",
        name: "Release",
        responsibility: "Ship approved changes safely.",
        doesNotOwn: ["Product priority"],
        intentIds: [],
        goals: [],
        loops: [],
      }),
    ).toThrow("Operation must link at least one Intent");
  });

  it("rejects invalid references and mixed Goal/Loop ownership", () => {
    expect(() =>
      buildOperation({
        id: "release",
        name: "Release",
        responsibility: "Ship approved changes safely.",
        doesNotOwn: ["Product priority"],
        intentIds: ["Reliable Delivery"],
        goals: [],
        loops: [],
      }),
    ).toThrow('Invalid Intent id "Reliable Delivery"');

    expect(() =>
      buildOperation({
        id: "release",
        name: "Release",
        responsibility: "Ship approved changes safely.",
        doesNotOwn: ["Product priority"],
        intentIds: ["reliable-delivery"],
        goals: ["release-health"],
        loops: ["release-health"],
      }),
    ).toThrow('Operation item "release-health" cannot be both a Goal and Loop');
  });

  it("reports unresolved work before activation", () => {
    const operation = buildOperation({
      id: "release",
      name: "Release",
      responsibility: "Ship approved changes safely.",
      doesNotOwn: ["Product priority"],
      intentIds: ["reliable-delivery"],
      goals: ["web-release"],
      loops: ["deployment-health"],
    });

    expect(
      operationActivationIssues(operation, {
        intents: ["reliable-delivery"],
        goals: [],
        loops: ["deployment-health"],
      }),
    ).toEqual(['Missing Goal "web-release"']);
    expect(
      canActivateOperation(operation, {
        intents: ["reliable-delivery"],
        goals: ["web-release"],
        loops: ["deployment-health"],
      }),
    ).toBe(true);
  });

  it("reports Goal and Loop ownership conflicts with other Operations", () => {
    const operation = buildOperation({
      id: "release",
      name: "Release",
      responsibility: "Ship approved changes safely.",
      doesNotOwn: ["Product priority"],
      intentIds: ["reliable-delivery"],
      goals: ["web-release"],
      loops: ["deployment-health"],
    });
    const other = buildOperation({
      id: "platform",
      name: "Platform",
      responsibility: "Keep the platform stable.",
      doesNotOwn: ["Release approval"],
      intentIds: ["reliable-delivery"],
      goals: ["web-release"],
      loops: ["deployment-health"],
    });

    expect(operationOwnershipIssues(operation, [operation, other])).toEqual([
      'Goal "web-release" is already owned by Operation "platform"',
      'Loop "deployment-health" is already owned by Operation "platform"',
    ]);
  });

  it("does not activate an Operation with no work", () => {
    const operation = buildOperation({
      id: "release",
      name: "Release",
      responsibility: "Ship approved changes safely.",
      doesNotOwn: ["Product priority"],
      intentIds: ["reliable-delivery"],
      goals: [],
      loops: [],
    });

    expect(
      operationActivationIssues(operation, {
        intents: ["reliable-delivery"],
        goals: [],
        loops: [],
      }),
    ).toEqual(["Operation must own at least one Goal or Loop"]);
  });

  it("uses one predictable state-repo path", () => {
    expect(operationPath("release")).toBe("operations/release/operation.json");
    expect(slugifyOperationId("Release Operations!")).toBe(
      "release-operations",
    );
    expect(() => operationPath("Release Team")).toThrow(
      'Invalid Operation id "Release Team"',
    );
  });

  it("rejects unsupported lifecycle and mismatched storage paths", () => {
    expect(() =>
      parseOperation("operations/release/operation.json", {
        version: 1,
        id: "release",
        name: "Release",
        responsibility: "Ship approved changes safely.",
        doesNotOwn: ["Product priority"],
        intentIds: ["reliable-delivery"],
        goals: [],
        loops: [],
        status: "running",
        createdAt: "2026-07-14T10:00:00.000Z",
        updatedAt: "2026-07-14T10:00:00.000Z",
      }),
    ).toThrow('Invalid Operation status "running"');

    expect(() =>
      parseOperation("operations/quality/operation.json", {
        version: 1,
        id: "release",
        name: "Release",
        responsibility: "Ship approved changes safely.",
        doesNotOwn: ["Product priority"],
        intentIds: ["reliable-delivery"],
        goals: [],
        loops: [],
        status: "proposed",
        createdAt: "2026-07-14T10:00:00.000Z",
        updatedAt: "2026-07-14T10:00:00.000Z",
      }),
    ).toThrow('Operation id "release" does not match path id "quality"');
  });

  it("rejects malformed persisted Operation data", () => {
    expect(() =>
      parseOperation("operations/release/operation.json", null),
    ).toThrow("expected object");
    expect(() =>
      parseOperation("operations/release/operation.json", { version: 2 }),
    ).toThrow("Invalid Operation version");
    expect(() =>
      parseOperation("operations/release/operation.json", {
        version: 1,
        id: "release",
        name: "Release",
        responsibility: "Ship approved changes safely.",
        doesNotOwn: ["Product priority"],
        intentIds: ["reliable-delivery"],
        goals: "web-release",
        loops: [],
        status: "proposed",
        createdAt: "not-a-date",
        updatedAt: "2026-07-14T10:00:00.000Z",
      }),
    ).toThrow("Operation Goal references must be an array");
    expect(() =>
      parseOperation("operations/release/operation.json", {
        version: 1,
        id: "release",
        name: "Release",
        responsibility: "Ship approved changes safely.",
        doesNotOwn: ["Product priority"],
        intentIds: ["reliable-delivery"],
        goals: [3],
        loops: [],
        status: "proposed",
        createdAt: "2026-07-14T10:00:00.000Z",
        updatedAt: "2026-07-14T10:00:00.000Z",
      }),
    ).toThrow('Invalid Goal id ""');
  });

  it("reports missing Loops and invalid timestamps", () => {
    const operation = buildOperation({
      id: "release",
      name: "Release",
      responsibility: "Ship approved changes safely.",
      doesNotOwn: ["Product priority"],
      intentIds: ["reliable-delivery"],
      goals: [],
      loops: ["deployment-health"],
    });

    expect(
      operationActivationIssues(operation, {
        intents: [],
        goals: [],
        loops: [],
      }),
    ).toEqual([
      'Missing Intent "reliable-delivery"',
      'Missing Loop "deployment-health"',
    ]);
    expect(() =>
      parseOperation("operations/release/operation.json", {
        ...operation,
        createdAt: "not-a-date",
      }),
    ).toThrow("Operation createdAt must be an ISO timestamp");
  });
});

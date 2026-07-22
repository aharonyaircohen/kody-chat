import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { setup } from "./helpers";

const tenantId = "acme/app";
const now = "2026-07-22T00:00:00.000Z";

describe("agency model persistence", () => {
  it("keeps definitions immutable and state independently mutable", async () => {
    const t = setup();
    await t.mutation(api.agencyModel.createDefinition, {
      tenantId,
      envelope: {
        schemaVersion: 1,
        recordId: "goal-record-1",
        kind: "goal",
        data: {
          id: "refresh-graph",
          operationId: "knowledge",
          objective: {
            desiredState: "Graph is current",
            requiredEvidence: ["published"],
            scope: { repository: tenantId },
          },
          executionRef: { kind: "workflow", id: "refresh-knowledge" },
        },
      },
      createdAt: now,
    });
    await expect(
      t.mutation(api.agencyModel.createDefinition, {
        tenantId,
        envelope: {
          schemaVersion: 1,
          recordId: "goal-record-1",
          kind: "goal",
          data: {},
        },
        createdAt: now,
      }),
    ).rejects.toThrow(/immutable/i);

    await t.mutation(api.agencyModel.putState, {
      tenantId,
      definitionId: "refresh-graph",
      kind: "goal",
      schemaVersion: 1,
      data: { lifecycle: "active", progress: 0, blockers: [] },
      updatedAt: now,
    });
    await t.mutation(api.agencyModel.putState, {
      tenantId,
      definitionId: "refresh-graph",
      kind: "goal",
      schemaVersion: 1,
      data: { lifecycle: "active", progress: 1, blockers: [] },
      updatedAt: "2026-07-22T00:01:00.000Z",
    });
    expect(
      await t.query(api.agencyModel.getState, {
        tenantId,
        definitionId: "refresh-graph",
      }),
    ).toMatchObject({ data: { progress: 1 } });
  });
});

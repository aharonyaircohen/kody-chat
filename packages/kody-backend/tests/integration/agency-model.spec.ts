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
      data: {
        definitionId: "refresh-graph",
        lifecycle: "active",
        progress: 0,
        blockers: [],
        updatedAt: now,
      },
      updatedAt: now,
    });
    await t.mutation(api.agencyModel.putState, {
      tenantId,
      definitionId: "refresh-graph",
      kind: "goal",
      schemaVersion: 1,
      data: {
        definitionId: "refresh-graph",
        lifecycle: "active",
        progress: 1,
        blockers: [],
        updatedAt: "2026-07-22T00:01:00.000Z",
      },
      updatedAt: "2026-07-22T00:01:00.000Z",
    });
    expect(
      await t.query(api.agencyModel.getState, {
        tenantId,
        definitionId: "refresh-graph",
      }),
    ).toMatchObject({ data: { progress: 1 } });
  });

  it("stores Run outputs once and queries them by Run", async () => {
    const t = setup();
    const output = {
      kind: "evidence" as const,
      key: "published",
      value: true,
      runId: "run-1",
      producer: { kind: "capability" as const, id: "build-knowledge-graph" },
      contract: "knowledge-graph",
      createdAt: now,
    };
    await t.mutation(api.agencyModel.appendOutput, {
      tenantId,
      envelope: { schemaVersion: 1, recordId: "output-1", data: output },
    });

    await expect(
      t.mutation(api.agencyModel.appendOutput, {
        tenantId,
        envelope: { schemaVersion: 1, recordId: "output-1", data: output },
      }),
    ).rejects.toThrow(/append-only/i);
    expect(await t.query(api.agencyModel.listOutputs, { tenantId, runId: "run-1" })).toHaveLength(1);
  });

  it("reserves each Trigger firing only once", async () => {
    const t = setup();
    const input = {
      tenantId,
      idempotencyKey: "refresh-graph:schedule:2026-07-22T01:00:00.000Z",
      loopId: "refresh-graph",
      decision: {
        kind: "fire" as const,
        reason: "scheduled trigger is due",
        scheduledAt: "2026-07-22T01:00:00.000Z",
      },
      leaseUntil: "2026-07-22T01:15:00.000Z",
      now,
    };

    await expect(t.mutation(api.agencyModel.reserveDispatch, input)).resolves.toMatchObject({ acquired: true });
    await expect(t.mutation(api.agencyModel.reserveDispatch, input)).resolves.toMatchObject({ acquired: false });
    await t.mutation(api.agencyModel.finishDispatch, {
      tenantId,
      idempotencyKey: input.idempotencyKey,
      status: "dispatched",
      runId: "run-1",
      now: "2026-07-22T00:02:00.000Z",
    });
    await expect(
      t.mutation(api.agencyModel.finishDispatch, {
        tenantId,
        idempotencyKey: input.idempotencyKey,
        status: "failed",
        now: "2026-07-22T00:03:00.000Z",
      }),
    ).rejects.toThrow(/terminal/i);
  });
});

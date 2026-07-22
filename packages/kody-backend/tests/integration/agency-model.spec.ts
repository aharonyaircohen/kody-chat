import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { setup, setupWithoutKey } from "./helpers";

const tenantId = "acme/app";
const now = "2026-07-22T00:00:00.000Z";

describe("agency model persistence", () => {
  it("rejects direct access without the backend service key", async () => {
    const t = setupWithoutKey();
    await expect(
      t.query(api.agencyModel.listDefinitions, { tenantId }),
    ).rejects.toThrow(/Unauthorized/i);
  });

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
          scope: { include: { repository: [tenantId] }, exclude: {} },
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
      reservationId: "reservation-1",
      correlationId: "correlation-1",
      policyHash: "policy-1",
      effectivePolicy: { approval: "none" },
      definitionRefs: [{ kind: "loop", id: "refresh-graph", revision: "loop-1" }],
      maxConcurrentRuns: 1,
      requiresApproval: false,
      approvalScopeKind: "loop" as const,
      approvalScopeId: "refresh-graph",
      approvalAction: "workflow:refresh-knowledge",
      now,
    };

    await expect(t.mutation(api.agencyModel.reserveDispatch, input)).resolves.toMatchObject({ acquired: true });
    await expect(t.mutation(api.agencyModel.reserveDispatch, input)).resolves.toMatchObject({ acquired: false });
    await t.mutation(api.agencyModel.finishDispatch, {
      tenantId,
      idempotencyKey: input.idempotencyKey,
      reservationId: input.reservationId,
      status: "dispatched",
      runId: "run-1",
      now: "2026-07-22T00:02:00.000Z",
    });
    await expect(
      t.mutation(api.agencyModel.finishDispatch, {
        tenantId,
        idempotencyKey: input.idempotencyKey,
        reservationId: input.reservationId,
        status: "failed",
        now: "2026-07-22T00:03:00.000Z",
      }),
    ).rejects.toThrow(/terminal/i);
  });

  it("enforces policy concurrency and fences reclaimed leases", async () => {
    const t = setup();
    const base = {
      tenantId,
      decision: { kind: "fire" as const, reason: "due", scheduledAt: now },
      correlationId: "correlation-1",
      policyHash: "shared-policy",
      effectivePolicy: { approval: "none" },
      definitionRefs: [],
      maxConcurrentRuns: 1,
      requiresApproval: false,
      approvalScopeKind: "loop" as const,
      approvalScopeId: "loop-1",
      approvalAction: "workflow:refresh-knowledge",
      now,
    };
    await expect(
      t.mutation(api.agencyModel.reserveDispatch, {
        ...base,
        idempotencyKey: "loop-1:fire-1",
        loopId: "loop-1",
        reservationId: "reservation-1",
        leaseUntil: "2026-07-22T00:10:00.000Z",
      }),
    ).resolves.toMatchObject({ acquired: true });
    await expect(
      t.mutation(api.agencyModel.reserveDispatch, {
        ...base,
        idempotencyKey: "loop-2:fire-1",
        loopId: "loop-2",
        reservationId: "reservation-2",
        leaseUntil: "2026-07-22T00:10:00.000Z",
      }),
    ).resolves.toEqual({ acquired: false, reason: "concurrency-limit" });
    await expect(
      t.mutation(api.agencyModel.reserveDispatch, {
        ...base,
        idempotencyKey: "loop-1:fire-1",
        loopId: "loop-1",
        reservationId: "reservation-reclaimed",
        leaseUntil: "2026-07-22T00:20:00.000Z",
        now: "2026-07-22T00:11:00.000Z",
      }),
    ).resolves.toMatchObject({ acquired: true, reclaimed: true });
    await expect(
      t.mutation(api.agencyModel.finishDispatch, {
        tenantId,
        idempotencyKey: "loop-1:fire-1",
        reservationId: "reservation-1",
        status: "failed",
        now: "2026-07-22T00:12:00.000Z",
      }),
    ).rejects.toThrow(/stale/i);
  });

  it("consumes required approval atomically with reservation", async () => {
    const t = setup();
    const reservation = {
      tenantId,
      idempotencyKey: "approved-loop:fire-1",
      loopId: "approved-loop",
      decision: { kind: "fire" as const, reason: "due", scheduledAt: now },
      leaseUntil: "2026-07-22T00:10:00.000Z",
      reservationId: "reservation-approved",
      correlationId: "correlation-approved",
      policyHash: "approval-policy",
      effectivePolicy: { approval: "all-actions" },
      definitionRefs: [],
      maxConcurrentRuns: 1,
      requiresApproval: true,
      approvalScopeKind: "loop" as const,
      approvalScopeId: "approved-loop",
      approvalAction: "workflow:refresh-knowledge",
      now,
    };
    await expect(t.mutation(api.agencyModel.reserveDispatch, reservation)).resolves.toEqual({
      acquired: false,
      reason: "approval-required",
    });
    await t.mutation(api.agencyModel.grantApproval, {
      tenantId,
      approvalId: "approval-reservation",
      scopeKind: "loop",
      scopeId: "approved-loop",
      action: "workflow:refresh-knowledge",
      approvedBy: "operator",
      approvedAt: now,
    });
    await expect(t.mutation(api.agencyModel.reserveDispatch, reservation)).resolves.toMatchObject({ acquired: true });
    await expect(t.mutation(api.agencyModel.reserveDispatch, reservation)).resolves.toMatchObject({
      acquired: false,
      reason: "duplicate",
    });
  });

  it("freezes Run provenance when an active Run becomes terminal", async () => {
    const t = setup();
    const activeRun = {
      id: "run-1",
      status: "running" as const,
      origin: { kind: "loop" as const, id: "refresh-loop", revision: "loop-rev" },
      target: { kind: "workflow" as const, id: "refresh-knowledge", revision: "workflow-rev" },
      trace: [
        { kind: "loop" as const, id: "refresh-loop", revision: "loop-rev" },
        { kind: "workflow" as const, id: "refresh-knowledge", revision: "workflow-rev" },
      ],
      effectivePolicy: {
        hash: "policy-hash",
        policy: {
          approval: "none" as const,
          authority: { allow: ["refresh-knowledge"], deny: [] },
          budget: { maxRuns: 1, maxTokens: 1000, maxCostUsd: 10, maxDurationSeconds: 300 },
          maxConcurrentRuns: 1,
          riskyActions: [],
        },
        constraints: [],
      },
      correlationId: "corr-1",
      startedAt: now,
    };
    await t.mutation(api.agencyModel.createRunRecord, {
      tenantId,
      subjectType: "workflow",
      subjectId: "refresh-knowledge",
      run: activeRun,
      now,
    });
    await t.mutation(api.agencyModel.finishRunRecord, {
      tenantId,
      run: {
        ...activeRun,
        status: "succeeded",
        finishedAt: "2026-07-22T00:01:00.000Z",
      },
      now: "2026-07-22T00:01:00.000Z",
    });
    await expect(
      t.mutation(api.agencyModel.finishRunRecord, {
        tenantId,
        run: {
          ...activeRun,
          status: "failed",
          finishedAt: "2026-07-22T00:02:00.000Z",
        },
        now: "2026-07-22T00:02:00.000Z",
      }),
    ).rejects.toThrow(/already terminal/i);
  });
});

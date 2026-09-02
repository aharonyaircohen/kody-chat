import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { setup } from "./helpers";

const TENANT = "acme/widgets";
const ACTOR = {
  tokenId: "token-codex",
  name: "Codex",
  actorLogin: "octocat",
};

describe("shared MCP work", () => {
  it("creates repository work and returns attributed activity", async () => {
    const t = setup();
    const created = await t.mutation(api.sharedWork.create, {
      tenantId: TENANT,
      recordId: "phase-3",
      title: "Ship shared work",
      objective: "Let another coding agent continue",
      actor: ACTOR,
      idempotencyKey: "create-phase-3",
      requestHash: "hash-create",
    });

    expect(created).toMatchObject({
      recordId: "phase-3",
      repository: TENANT,
      revision: 1,
      status: "active",
      updatedBy: ACTOR,
    });
    await expect(
      t.query(api.sharedWork.get, { tenantId: TENANT, recordId: "phase-3" }),
    ).resolves.toMatchObject({
      record: { title: "Ship shared work" },
      events: [{ seq: 1, type: "created", actor: ACTOR }],
    });
  });

  it("deduplicates retries and rejects reuse with different input", async () => {
    const t = setup();
    const input = {
      tenantId: TENANT,
      recordId: "retry-safe",
      title: "Retry safely",
      objective: "Only create once",
      actor: ACTOR,
      idempotencyKey: "same-request-key",
      requestHash: "same-request-hash",
    };
    const first = await t.mutation(api.sharedWork.create, input);
    const second = await t.mutation(api.sharedWork.create, input);
    expect(second).toEqual(first);
    await expect(
      t.mutation(api.sharedWork.create, {
        ...input,
        requestHash: "different-request-hash",
      }),
    ).rejects.toThrow("Idempotency key was already used with different input");
    const detail = await t.query(api.sharedWork.get, {
      tenantId: TENANT,
      recordId: "retry-safe",
    });
    expect(detail?.events).toHaveLength(1);
  });

  it("applies conflict-safe checkpoints, evidence, decisions, and handoffs", async () => {
    const t = setup();
    await t.mutation(api.sharedWork.create, {
      tenantId: TENANT,
      recordId: "handoff",
      title: "Cross-agent handoff",
      objective: "Continue without a transcript",
      actor: ACTOR,
      idempotencyKey: "create-handoff",
      requestHash: "hash-1",
    });
    const updated = await t.mutation(api.sharedWork.append, {
      tenantId: TENANT,
      recordId: "handoff",
      expectedRevision: 1,
      type: "checkpoint",
      payload: { summary: "Persistence implemented" },
      actor: ACTOR,
      idempotencyKey: "checkpoint-handoff",
      requestHash: "hash-2",
    });
    expect(updated.revision).toBe(2);
    await expect(
      t.mutation(api.sharedWork.append, {
        tenantId: TENANT,
        recordId: "handoff",
        expectedRevision: 1,
        type: "handoff",
        payload: {
          toAgent: "OpenCode",
          summary: "Continue tests",
          nextSteps: ["Run E2E"],
        },
        actor: ACTOR,
        idempotencyKey: "stale-handoff",
        requestHash: "hash-stale",
      }),
    ).rejects.toThrow("Shared work changed since it was read");

    const handoff = await t.mutation(api.sharedWork.append, {
      tenantId: TENANT,
      recordId: "handoff",
      expectedRevision: 2,
      type: "handoff",
      payload: {
        toAgent: "OpenCode",
        summary: "Continue tests",
        nextSteps: ["Run E2E"],
      },
      actor: { ...ACTOR, tokenId: "token-opencode", name: "OpenCode" },
      idempotencyKey: "valid-handoff",
      requestHash: "hash-3",
    });
    expect(handoff).toMatchObject({
      revision: 3,
      handoff: { toAgent: "OpenCode", summary: "Continue tests" },
      updatedBy: { name: "OpenCode" },
    });
  });

  it("lists only records in the selected repository", async () => {
    const t = setup();
    for (const [tenantId, recordId] of [
      [TENANT, "visible"],
      ["other/repo", "hidden"],
    ] as const) {
      await t.mutation(api.sharedWork.create, {
        tenantId,
        recordId,
        title: recordId,
        objective: recordId,
        actor: ACTOR,
        idempotencyKey: `create-${recordId}`,
        requestHash: `hash-${recordId}`,
      });
    }
    const rows = await t.query(api.sharedWork.list, {
      tenantId: TENANT,
      limit: 20,
    });
    expect(rows.map((row) => row.recordId)).toEqual(["visible"]);
  });
});

import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { setup } from "./helpers";

const TENANT = "acme/app";
const ACTOR = "user-1";
const NOW = "2026-07-18T00:00:00.000Z";

const START = {
  tenantId: TENANT,
  actorId: ACTOR,
  instanceId: "flow-instance-1",
  flowId: "create-workflow",
  flowVersion: 1,
  currentStepId: "choose-capability",
  status: "active" as const,
  revision: 0,
  data: {},
  history: [],
  updatedAt: NOW,
};

describe("guidedFlows", () => {
  it("stores and lists active instances per actor and tenant", async () => {
    const t = setup();
    await t.mutation(api.guidedFlows.upsert, START);
    await t.mutation(api.guidedFlows.upsert, {
      ...START,
      instanceId: "other-actor-flow",
      actorId: "user-2",
    });

    const active = await t.query(api.guidedFlows.listActive, {
      tenantId: TENANT,
      actorId: ACTOR,
    });

    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      instanceId: START.instanceId,
      currentStepId: START.currentStepId,
    });
  });

  it("updates only when the expected revision matches", async () => {
    const t = setup();
    await t.mutation(api.guidedFlows.upsert, START);

    await t.mutation(api.guidedFlows.update, {
      tenantId: TENANT,
      actorId: ACTOR,
      instanceId: START.instanceId,
      expectedRevision: 0,
      currentStepId: "review",
      status: "active",
      revision: 1,
      data: { capability: "test" },
      history: ["choose-capability"],
      updatedAt: NOW,
      mutationId: "mutation-1",
    });

    await expect(
      t.mutation(api.guidedFlows.update, {
        tenantId: TENANT,
        actorId: ACTOR,
        instanceId: START.instanceId,
        expectedRevision: 0,
        currentStepId: "done",
        status: "completed",
        revision: 2,
        data: {},
        history: [],
        updatedAt: NOW,
        mutationId: "mutation-2",
      }),
    ).rejects.toThrow("revision");
  });

  it("returns the stored record for a repeated mutation id", async () => {
    const t = setup();
    await t.mutation(api.guidedFlows.upsert, START);

    const input = {
      tenantId: TENANT,
      actorId: ACTOR,
      instanceId: START.instanceId,
      expectedRevision: 0,
      currentStepId: "review",
      status: "active" as const,
      revision: 1,
      data: { capability: "test" },
      history: ["choose-capability"],
      updatedAt: NOW,
      mutationId: "mutation-1",
    };

    const first = await t.mutation(api.guidedFlows.update, input);
    const second = await t.mutation(api.guidedFlows.update, input);

    expect(second).toEqual(first);
  });

  it("does not leak instances across tenants", async () => {
    const t = setup();
    await t.mutation(api.guidedFlows.upsert, START);

    expect(
      await t.query(api.guidedFlows.get, {
        tenantId: "other/tenant",
        actorId: ACTOR,
        instanceId: START.instanceId,
      }),
    ).toBeNull();
  });

  const COMPLETION = {
    tenantId: TENANT,
    actorId: ACTOR,
    instanceId: "flow-instance-1",
    flowId: "create-workflow",
    flowVersion: 1,
    completedAt: NOW,
    data: { actionId: "finish", score: 9 },
  };

  it("records completions append-only per actor, newest first", async () => {
    const t = setup();
    await t.mutation(api.guidedFlows.recordCompletion, COMPLETION);
    await t.mutation(api.guidedFlows.recordCompletion, {
      ...COMPLETION,
      instanceId: "flow-instance-2",
      completedAt: "2026-07-19T00:00:00.000Z",
    });

    const completions = await t.query(api.guidedFlows.listCompletions, {
      tenantId: TENANT,
      actorId: ACTOR,
    });

    expect(completions).toHaveLength(2);
    expect(completions[0]).toMatchObject({ instanceId: "flow-instance-2" });
    expect(completions[1]).toMatchObject({
      instanceId: "flow-instance-1",
      data: { actionId: "finish", score: 9 },
    });
  });

  it("keeps one completion per instance and none across tenants or actors", async () => {
    const t = setup();
    await t.mutation(api.guidedFlows.recordCompletion, COMPLETION);
    await t.mutation(api.guidedFlows.recordCompletion, COMPLETION);

    expect(
      await t.query(api.guidedFlows.listCompletions, {
        tenantId: TENANT,
        actorId: ACTOR,
      }),
    ).toHaveLength(1);
    expect(
      await t.query(api.guidedFlows.listCompletions, {
        tenantId: "other/tenant",
        actorId: ACTOR,
      }),
    ).toHaveLength(0);
    expect(
      await t.query(api.guidedFlows.listCompletions, {
        tenantId: TENANT,
        actorId: "user-2",
      }),
    ).toHaveLength(0);
  });
});

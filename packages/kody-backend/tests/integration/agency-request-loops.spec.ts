import { describe, expect, it } from "vitest";

import { api } from "../../convex/_generated/api";
import { setup } from "./helpers";

const TENANT = "acme/app";
const NOW = "2026-08-14T00:00:00.000Z";

function todo(phase: "monitoring" | "done", related: unknown[]) {
  return {
    version: 1,
    title: "Build healthy CI",
    description: "",
    createdAt: NOW,
    items: [],
    agencyRequest: {
      phase,
      source: {
        kind: "guided-flow",
        instanceId: "flow-1",
        effectId: "effect-1",
      },
      requirement: { outcome: "Build healthy CI" },
      questions: [],
      plan: [],
      execution: {
        workflowId: "apply-strategy",
        input: {
          blueprintId: "healthy-ci",
          installation: { configPatch: { workflows: ["ci-repair"] } },
        },
      },
      evidence: [],
      blockers: [],
      related,
    },
  };
}

describe("agency request runtime Loops", () => {
  it("derives an executable Loop from an active Todo", async () => {
    const t = setup();
    await t.mutation(api.repoDocs.save, {
      tenantId: TENANT,
      kind: "todo:build-healthy-ci",
      doc: todo("monitoring", [
        { kind: "loop", id: "agency-request-build-healthy-ci" },
        { kind: "run", id: "failed-run" },
      ]),
      updatedAt: NOW,
    });
    await t.mutation(api.workflowRuns.save, {
      tenantId: TENANT,
      workflowId: "apply-strategy",
      runId: "failed-run",
      state: {
        status: "failed",
        completedStepIds: [],
        steps: {},
        facts: {},
      },
      updatedAt: NOW,
    });

    await expect(
      t.query(api.agencyRequestLoops.list, { tenantId: TENANT }),
    ).resolves.toEqual([
      {
        id: "agency-request-build-healthy-ci",
        trigger: { type: "schedule", every: "15m" },
        target: { kind: "workflow", id: "apply-strategy" },
        input: {
          blueprintId: "healthy-ci",
          installation: { configPatch: { workflows: ["ci-repair"] } },
          agencyRequest: {
            todoSlug: "build-healthy-ci",
            outcome: "Build healthy CI",
            evidence: [],
            blockers: [],
            previousRunId: "failed-run",
          },
        },
        enabled: true,
      },
    ]);
  });

  it("removes the Loop by completing the Todo", async () => {
    const t = setup();
    await t.mutation(api.repoDocs.save, {
      tenantId: TENANT,
      kind: "todo:build-healthy-ci",
      doc: todo("done", []),
      updatedAt: NOW,
    });

    await expect(
      t.query(api.agencyRequestLoops.list, { tenantId: TENANT }),
    ).resolves.toEqual([]);
  });

  it("does not start another attempt while the current Workflow is running", async () => {
    const t = setup();
    await t.mutation(api.repoDocs.save, {
      tenantId: TENANT,
      kind: "todo:build-healthy-ci",
      doc: todo("monitoring", [
        { kind: "loop", id: "agency-request-build-healthy-ci" },
        { kind: "run", id: "active-run" },
      ]),
      updatedAt: NOW,
    });
    await t.mutation(api.workflowRuns.save, {
      tenantId: TENANT,
      workflowId: "apply-strategy",
      runId: "active-run",
      state: {
        status: "running",
        completedStepIds: [],
        steps: {},
        facts: {},
      },
      updatedAt: NOW,
    });

    await expect(
      t.query(api.agencyRequestLoops.list, { tenantId: TENANT }),
    ).resolves.toEqual([]);
  });
});

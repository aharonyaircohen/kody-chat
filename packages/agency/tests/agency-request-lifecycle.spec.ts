import { describe, expect, it, vi } from "vitest";

import {
  completeAgencyRequestRun,
  startAgencyRequest,
  type AgencyRequestRecord,
} from "../src/agency-request-lifecycle";

const baseRecord: AgencyRequestRecord = {
  slug: "keep-ci-healthy",
  state: {
    phase: "waiting-approval",
    source: {
      kind: "guided-flow",
      instanceId: "flow-1",
      effectId: "effect-1",
    },
    requirement: {
      outcome: "Keep CI healthy",
      permissions: "Create a PR; do not merge or deploy",
      success: "Main CI is green",
    },
    questions: [],
    plan: ["Run CI Repair and verify main"],
    execution: {
      workflowId: "ci-repair",
      input: { branch: "main", ciRunId: 123, headSha: "abc" },
    },
    evidence: [],
    blockers: [],
    related: [{ kind: "workflow", id: "ci-repair" }],
  },
};

describe("Agency request lifecycle", () => {
  it("reserves, dispatches, and monitors one approved workflow run", async () => {
    const save = vi.fn(async () => undefined);
    const dispatch = vi.fn(async () => ({ runId: "run-123" }));

    const result = await startAgencyRequest("keep-ci-healthy", {
      read: vi.fn(async () => baseRecord),
      save,
      createRunId: () => "run-123",
      dispatch,
    });

    expect(dispatch).toHaveBeenCalledWith(
      baseRecord.state.execution,
      "run-123",
    );
    expect(save.mock.calls[0]?.[1]).toMatchObject({
      phase: "monitoring",
      related: expect.arrayContaining([{ kind: "run", id: "run-123" }]),
    });
    expect(result).toEqual({ kind: "started", runId: "run-123" });
  });

  it("does not dispatch an Agency request twice", async () => {
    const dispatch = vi.fn();
    const record: AgencyRequestRecord = {
      ...baseRecord,
      state: {
        ...baseRecord.state,
        phase: "monitoring",
        related: [
          ...baseRecord.state.related,
          { kind: "run", id: "run-123" },
        ],
      },
    };

    await expect(
      startAgencyRequest(record.slug, {
        read: vi.fn(async () => record),
        save: vi.fn(),
        createRunId: () => "run-unused",
        dispatch,
      }),
    ).resolves.toEqual({ kind: "existing", runId: "run-123" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("records a dispatch failure as a precise blocker", async () => {
    const save = vi.fn(async () => undefined);

    await expect(
      startAgencyRequest(baseRecord.slug, {
        read: vi.fn(async () => baseRecord),
        save,
        createRunId: () => "run-123",
        dispatch: vi.fn(async () => {
          throw new Error("Workflow input is invalid");
        }),
      }),
    ).rejects.toThrow("Workflow input is invalid");
    expect(save.mock.calls.at(-1)?.[1]).toMatchObject({
      phase: "blocked",
      blockers: ["Workflow input is invalid"],
      related: expect.arrayContaining([{ kind: "run", id: "run-123" }]),
    });
  });

  it("marks a monitored successful run done with evidence", async () => {
    const save = vi.fn(async () => undefined);
    const record: AgencyRequestRecord = {
      ...baseRecord,
      state: {
        ...baseRecord.state,
        phase: "monitoring",
        related: [
          ...baseRecord.state.related,
          { kind: "run", id: "run-123" },
        ],
      },
    };

    const result = await completeAgencyRequestRun(
      {
        workflowId: "ci-repair",
        runId: "run-123",
        status: "success",
        summary: "Repair PR passed and main CI is green.",
      },
      { findByRun: vi.fn(async () => [record]), save },
    );

    expect(result).toEqual({ updated: 1 });
    expect(save).toHaveBeenCalledWith(
      record.slug,
      expect.objectContaining({
        phase: "done",
        evidence: [
          "Workflow ci-repair run run-123 succeeded: Repair PR passed and main CI is green.",
        ],
        blockers: [],
      }),
    );
  });

  it("marks a failed run blocked without changing unrelated requests", async () => {
    const save = vi.fn(async () => undefined);

    const result = await completeAgencyRequestRun(
      {
        workflowId: "ci-repair",
        runId: "run-404",
        status: "failed",
        summary: "Repair exhausted its bounded retries.",
      },
      { findByRun: vi.fn(async () => []), save },
    );

    expect(result).toEqual({ updated: 0 });
    expect(save).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";

import {
  ObservationSchema,
  FindingSchema,
  LearningSchema,
  reconcileFinding,
} from "@kody-ade/agency/observation-state";

const unhealthyObservation = {
  version: 1 as const,
  id: "obs-ci-main-2026-07-12t100000z",
  observerId: "agency-observer",
  capability: "observe-repo-ci",
  subject: "repo-ci:main",
  status: "unhealthy" as const,
  summary: "Default branch CI is failing",
  evidence: [{ kind: "check-run", label: "test", status: "failure" }],
  observedAt: "2026-07-12T10:00:00.000Z",
};

describe("agency observation state", () => {
  it("validates the three durable agency state models", () => {
    expect(ObservationSchema.parse(unhealthyObservation).status).toBe(
      "unhealthy",
    );
    expect(
      FindingSchema.parse({
        version: 1,
        id: "finding-repo-ci-main",
        observerId: "agency-observer",
        subject: "repo-ci:main",
        title: "Default branch CI is failing",
        expectation: "Default branch CI is green",
        actual: "Default branch CI is failing",
        severity: "high",
        status: "open",
        phase: "observed",
        observationIds: [unhealthyObservation.id],
        createdAt: unhealthyObservation.observedAt,
        updatedAt: unhealthyObservation.observedAt,
      }).status,
    ).toBe("open");
    expect(
      LearningSchema.parse({
        version: 1,
        id: "learning-repo-ci-main-1",
        findingId: "finding-repo-ci-main",
        summary: "Run CI verification before delivery",
        change: {
          kind: "memory",
          target: "delivery-policy",
          description: "Added CI verification requirement",
        },
        evidence: ["run-123"],
        createdAt: "2026-07-12T10:30:00.000Z",
      }).findingId,
    ).toBe("finding-repo-ci-main");
  });

  it("rejects unsafe ids and oversized evidence", () => {
    expect(() =>
      ObservationSchema.parse({
        ...unhealthyObservation,
        id: "../../secrets",
      }),
    ).toThrow();
    expect(() =>
      ObservationSchema.parse({
        ...unhealthyObservation,
        evidence: Array.from({ length: 101 }, (_, index) => ({
          kind: "line",
          label: String(index),
        })),
      }),
    ).toThrow();
  });

  it("updates one finding for repeated unhealthy observations", () => {
    const first = reconcileFinding({
      observation: unhealthyObservation,
      expectation: "Default branch CI is green",
      severity: "high",
    });
    const secondObservation = {
      ...unhealthyObservation,
      id: "obs-ci-main-2026-07-12t101500z",
      observedAt: "2026-07-12T10:15:00.000Z",
      summary: "Default branch CI still failing",
    };
    const second = reconcileFinding({
      previous: first!,
      observation: secondObservation,
      expectation: "Default branch CI is green",
      severity: "high",
    });

    expect(second?.id).toBe(first?.id);
    expect(second?.status).toBe("open");
    expect(second?.observationIds).toEqual([
      unhealthyObservation.id,
      secondObservation.id,
    ]);
  });

  it("hands the same finding to verification when evidence becomes healthy", () => {
    const open = reconcileFinding({
      observation: unhealthyObservation,
      expectation: "Default branch CI is green",
      severity: "high",
    });
    const resolved = reconcileFinding({
      previous: open!,
      observation: {
        ...unhealthyObservation,
        id: "obs-ci-main-2026-07-12t103000z",
        status: "healthy",
        summary: "Default branch CI is green",
        observedAt: "2026-07-12T10:30:00.000Z",
      },
      expectation: "Default branch CI is green",
      severity: "high",
    });

    expect(resolved?.id).toBe(open?.id);
    expect(resolved?.status).toBe("in_progress");
    expect(resolved?.phase).toBe("verifying");
    expect(resolved?.resolvedAt).toBeUndefined();
  });

  it("does not create a finding when the first observation is healthy", () => {
    expect(
      reconcileFinding({
        observation: {
          ...unhealthyObservation,
          status: "healthy",
          summary: "Default branch CI is green",
        },
        expectation: "Default branch CI is green",
        severity: "high",
      }),
    ).toBeNull();
  });

  it("reopens verification when fresh evidence is unhealthy", () => {
    const open = reconcileFinding({
      observation: unhealthyObservation,
      expectation: "Default branch CI is green",
      severity: "high",
    });
    const verifying = reconcileFinding({
      previous: open!,
      observation: {
        ...unhealthyObservation,
        id: "obs-ci-main-healthy",
        status: "healthy",
        summary: "Default branch CI is green",
        observedAt: "2026-07-12T10:15:00.000Z",
      },
      expectation: "Default branch CI is green",
      severity: "high",
    });
    const reopened = reconcileFinding({
      previous: verifying!,
      observation: {
        ...unhealthyObservation,
        id: "obs-ci-main-red-again",
        observedAt: "2026-07-12T10:30:00.000Z",
      },
      expectation: "Default branch CI is green",
      severity: "high",
    });

    expect(reopened?.status).toBe("open");
    expect(reopened?.phase).toBe("observed");
  });
});

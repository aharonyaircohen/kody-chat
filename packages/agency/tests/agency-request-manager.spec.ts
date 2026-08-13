import { describe, expect, it, vi } from "vitest";
import { submitAgencyRequest } from "../src/agency-request-manager";

describe("Agency Request Manager", () => {
  it("creates one assessing Todo and returns a Kody handoff", async () => {
    const create = vi.fn(async () => ({ slug: "keep-ci-healthy" }));
    const findBySource = vi.fn(async () => null);

    const result = await submitAgencyRequest(
      {
        source: {
          kind: "guided-flow",
          instanceId: "flow-1",
          effectId: "effect-1",
        },
        answers: {
          desiredOutcome: "Keep CI healthy on main",
          activation: "Whenever GitHub CI fails",
          allowedActions: "Create a pull request; do not merge",
          successCriteria: "The latest main CI run is green",
          additionalContext: "Use CI Repair when compatible",
        },
      },
      { create, findBySource },
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Keep CI healthy on main",
        agencyRequest: expect.objectContaining({ phase: "assessing" }),
      }),
    );
    expect(result).toMatchObject({
      created: true,
      todoSlug: "keep-ci-healthy",
      handoff: { type: "kody" },
    });
    expect(result.handoff.message).toContain("keep-ci-healthy");
  });

  it("returns the existing Todo when a completion effect is retried", async () => {
    const create = vi.fn();
    const result = await submitAgencyRequest(
      {
        source: {
          kind: "guided-flow",
          instanceId: "flow-1",
          effectId: "effect-1",
        },
        answers: { desiredOutcome: "Keep CI healthy" },
      },
      {
        create,
        findBySource: vi.fn(async () => ({ slug: "keep-ci-healthy" })),
      },
    );

    expect(create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      created: false,
      todoSlug: "keep-ci-healthy",
    });
  });

  it("refuses a request without an outcome", async () => {
    await expect(
      submitAgencyRequest(
        {
          source: {
            kind: "guided-flow",
            instanceId: "flow-1",
            effectId: "effect-1",
          },
          answers: {},
        },
        {
          create: vi.fn(),
          findBySource: vi.fn(async () => null),
        },
      ),
    ).rejects.toThrow(/outcome/i);
  });
});

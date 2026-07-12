/**
 * Unit tests for the pure guide engine (@kody-ade/base/guides/engine):
 * position clamping, keyword gating, and pointer advance.
 */
import { describe, it, expect } from "vitest";
import {
  positionAt,
  answerCompletesStep,
  nextPointer,
} from "@kody-ade/base/guides/engine";
import type { GuideConfig } from "@kody-ade/base/guides/types";

const guide: GuideConfig = {
  slug: "intro",
  title: "Intro",
  description: "",
  enabled: true,
  steps: [
    { id: "a", title: "One", instruction: "teach one", advance: "model" },
    {
      id: "b",
      title: "Two",
      instruction: "ask two",
      advance: "keyword",
      keyword: "yes",
    },
  ],
};

describe("positionAt", () => {
  it("returns the current step and clamps negatives", () => {
    expect(positionAt(guide, 0).step?.id).toBe("a");
    expect(positionAt(guide, -5).index).toBe(0);
    expect(positionAt(guide, 1).step?.id).toBe("b");
  });

  it("reports finished past the last step", () => {
    const pos = positionAt(guide, 2);
    expect(pos.finished).toBe(true);
    expect(pos.step).toBeNull();
    expect(pos.total).toBe(2);
  });
});

describe("answerCompletesStep", () => {
  it("model steps always complete", () => {
    expect(answerCompletesStep(guide.steps[0], "")).toBe(true);
  });
  it("keyword steps require the keyword (case-insensitive)", () => {
    expect(answerCompletesStep(guide.steps[1], "I say YES please")).toBe(true);
    expect(answerCompletesStep(guide.steps[1], "no")).toBe(false);
  });
});

describe("nextPointer", () => {
  it("moves forward one and never past the end", () => {
    expect(nextPointer(guide, 0)).toBe(1);
    expect(nextPointer(guide, 1)).toBe(2);
    expect(nextPointer(guide, 2)).toBe(2);
  });
});

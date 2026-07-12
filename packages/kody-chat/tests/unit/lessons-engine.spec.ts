/**
 * Unit tests for the pure lesson engine (@kody-ade/base/lessons/engine):
 * position clamping, keyword gating, and pointer advance.
 */
import { describe, it, expect } from "vitest";
import {
  positionAt,
  answerCompletesStep,
  nextPointer,
} from "@kody-ade/base/lessons/engine";
import type { LessonConfig } from "@kody-ade/base/lessons/types";

const lesson: LessonConfig = {
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
    expect(positionAt(lesson, 0).step?.id).toBe("a");
    expect(positionAt(lesson, -5).index).toBe(0);
    expect(positionAt(lesson, 1).step?.id).toBe("b");
  });

  it("reports finished past the last step", () => {
    const pos = positionAt(lesson, 2);
    expect(pos.finished).toBe(true);
    expect(pos.step).toBeNull();
    expect(pos.total).toBe(2);
  });
});

describe("answerCompletesStep", () => {
  it("model steps always complete", () => {
    expect(answerCompletesStep(lesson.steps[0], "")).toBe(true);
  });
  it("keyword steps require the keyword (case-insensitive)", () => {
    expect(answerCompletesStep(lesson.steps[1], "I say YES please")).toBe(true);
    expect(answerCompletesStep(lesson.steps[1], "no")).toBe(false);
  });
});

describe("nextPointer", () => {
  it("moves forward one and never past the end", () => {
    expect(nextPointer(lesson, 0)).toBe(1);
    expect(nextPointer(lesson, 1)).toBe(2);
    expect(nextPointer(lesson, 2)).toBe(2);
  });
});

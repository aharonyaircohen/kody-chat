/**
 * Unit tests for the pure guide engine (@kody-ade/base/guides/engine):
 * id-pointer position, keyword gating, and next-pointer.
 */
import { describe, it, expect } from "vitest";
import {
  currentByPointer,
  answerCompletesStep,
  nextPointerId,
} from "@kody-ade/base/guides/engine";
import { GUIDE_FINISHED, type GuideStep } from "@kody-ade/base/guides/types";

const steps: GuideStep[] = [
  { id: "a", title: "One", instruction: "teach one", advance: "model" },
  {
    id: "b",
    title: "Two",
    instruction: "ask two",
    advance: "keyword",
    keyword: "yes",
  },
];

describe("currentByPointer", () => {
  it("empty pointer starts at the first step", () => {
    expect(currentByPointer(steps, "").step?.id).toBe("a");
    expect(currentByPointer(steps, undefined).index).toBe(0);
  });
  it("resolves the current step by id", () => {
    expect(currentByPointer(steps, "b").step?.id).toBe("b");
    expect(currentByPointer(steps, "b").index).toBe(1);
  });
  it("an unknown (deleted) step id falls back to the first, drift-safe", () => {
    expect(currentByPointer(steps, "gone").step?.id).toBe("a");
  });
  it("the finished sentinel reports finished", () => {
    const pos = currentByPointer(steps, GUIDE_FINISHED);
    expect(pos.finished).toBe(true);
    expect(pos.step).toBeNull();
  });
});

describe("answerCompletesStep", () => {
  it("model steps always complete", () => {
    expect(answerCompletesStep(steps[0], "")).toBe(true);
  });
  it("keyword steps require the keyword (case-insensitive)", () => {
    expect(answerCompletesStep(steps[1], "I say YES")).toBe(true);
    expect(answerCompletesStep(steps[1], "no")).toBe(false);
  });
});

describe("nextPointerId", () => {
  it("returns the next step id, then the finished sentinel", () => {
    expect(nextPointerId(steps, "a")).toBe("b");
    expect(nextPointerId(steps, "b")).toBe(GUIDE_FINISHED);
    expect(nextPointerId(steps, "")).toBe("b");
  });
});

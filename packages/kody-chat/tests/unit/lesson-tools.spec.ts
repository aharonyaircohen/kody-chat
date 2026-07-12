/**
 * Unit tests for the lesson chat tools
 * (app/api/kody/chat/tools/lesson-tools.ts): the model only ever sees the
 * current step, and advancing moves the per-student pointer one step.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Octokit } from "@octokit/rest";

const h = vi.hoisted(() => ({
  listLessons: vi.fn(),
  getLesson: vi.fn(),
  getUserState: vi.fn(),
  setUserState: vi.fn(),
}));

vi.mock("@kody-ade/base/lessons", async () => {
  const actual = await vi.importActual<
    typeof import("@kody-ade/base/lessons")
  >("@kody-ade/base/lessons");
  return { ...actual, listLessons: h.listLessons, getLesson: h.getLesson };
});
vi.mock("@dashboard/lib/user-state", () => ({
  getUserState: h.getUserState,
  setUserState: h.setUserState,
}));

import { createLessonTools } from "@dashboard/../../app/api/kody/chat/tools/lesson-tools";
import type { LessonConfig } from "@kody-ade/base/lessons/types";

const LESSON: LessonConfig = {
  slug: "intro",
  title: "Intro",
  description: "",
  enabled: true,
  steps: [
    { id: "a", title: "One", instruction: "teach one", advance: "model" },
    { id: "b", title: "Two", instruction: "teach two", advance: "model" },
  ],
};

const ctx = {
  octokit: {} as Octokit,
  owner: "acme",
  repo: "shop",
  userId: "operator:teacher",
};

async function tools() {
  return createLessonTools(ctx);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.listLessons.mockResolvedValue([LESSON]);
  h.getLesson.mockResolvedValue({ lesson: LESSON, sha: "s1" });
  h.getUserState.mockResolvedValue({ data: {} });
  h.setUserState.mockResolvedValue({});
});

describe("lesson tools", () => {
  it("lesson_current returns only the current step, never later ones", async () => {
    h.getUserState.mockResolvedValue({ data: { "lesson:intro:step": 0 } });
    const t = await tools();
    const out = (await t.lesson_current.execute!(
      { slug: "intro" },
      {} as never,
    )) as { step?: { id: string }; stepNumber: number };
    expect(out.step?.id).toBe("a");
    expect(out.stepNumber).toBe(1);
    expect(JSON.stringify(out)).not.toContain('"b"');
  });

  it("lesson_start resets the pointer to 0", async () => {
    const t = await tools();
    await t.lesson_start.execute!({ slug: "intro" }, {} as never);
    expect(h.setUserState).toHaveBeenCalledWith(
      expect.anything(),
      "progress",
      { "lesson:intro:step": 0 },
      { source: "system" },
    );
  });

  it("lesson_advance moves the pointer forward one step", async () => {
    h.getUserState.mockResolvedValue({ data: { "lesson:intro:step": 0 } });
    const t = await tools();
    const out = (await t.lesson_advance.execute!(
      { slug: "intro", answer: "ok" },
      {} as never,
    )) as { advanced: boolean; step?: { id: string } };
    expect(out.advanced).toBe(true);
    expect(out.step?.id).toBe("b");
    expect(h.setUserState).toHaveBeenCalledWith(
      expect.anything(),
      "progress",
      { "lesson:intro:step": 1 },
      { source: "system" },
    );
  });

  it("keyword steps do not advance without the keyword", async () => {
    const kw: LessonConfig = {
      ...LESSON,
      steps: [
        {
          id: "a",
          title: "One",
          instruction: "say yes",
          advance: "keyword",
          keyword: "yes",
        },
        LESSON.steps[1],
      ],
    };
    h.listLessons.mockResolvedValue([kw]);
    h.getLesson.mockResolvedValue({ lesson: kw, sha: "s1" });
    h.getUserState.mockResolvedValue({ data: { "lesson:intro:step": 0 } });
    const t = await tools();
    const out = (await t.lesson_advance.execute!(
      { slug: "intro", answer: "no" },
      {} as never,
    )) as { advanced: boolean };
    expect(out.advanced).toBe(false);
    expect(h.setUserState).not.toHaveBeenCalled();
  });

  it("returns no tools when there are no enabled lessons", async () => {
    h.listLessons.mockResolvedValue([{ ...LESSON, enabled: false }]);
    expect(Object.keys(await tools())).toEqual([]);
  });
});

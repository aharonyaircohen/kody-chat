/**
 * Unit tests for the guide chat tools
 * (app/api/kody/chat/tools/guide-tools.ts): the model only ever sees the
 * current step, and advancing moves the per-student pointer one step.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Octokit } from "@octokit/rest";

const h = vi.hoisted(() => ({
  listGuides: vi.fn(),
  getGuide: vi.fn(),
  getUserState: vi.fn(),
  setUserState: vi.fn(),
}));

vi.mock("@kody-ade/base/guides", async () => {
  const actual = await vi.importActual<
    typeof import("@kody-ade/base/guides")
  >("@kody-ade/base/guides");
  return { ...actual, listGuides: h.listGuides, getGuide: h.getGuide };
});
vi.mock("@dashboard/lib/user-state", () => ({
  getUserState: h.getUserState,
  setUserState: h.setUserState,
}));

import { createGuideTools } from "@dashboard/../../app/api/kody/chat/tools/guide-tools";
import type { GuideConfig } from "@kody-ade/base/guides/types";

const GUIDE: GuideConfig = {
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
  return createGuideTools(ctx);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.listGuides.mockResolvedValue([GUIDE]);
  h.getGuide.mockResolvedValue({ guide: GUIDE, sha: "s1" });
  h.getUserState.mockResolvedValue({ data: {} });
  h.setUserState.mockResolvedValue({});
});

describe("guide tools", () => {
  it("guide_current returns only the current step, never later ones", async () => {
    h.getUserState.mockResolvedValue({ data: { "guide:intro:step": 0 } });
    const t = await tools();
    const out = (await t.guide_current.execute!(
      { slug: "intro" },
      {} as never,
    )) as { step?: { id: string }; stepNumber: number };
    expect(out.step?.id).toBe("a");
    expect(out.stepNumber).toBe(1);
    expect(JSON.stringify(out)).not.toContain('"b"');
  });

  it("guide_start resets the pointer to 0", async () => {
    const t = await tools();
    await t.guide_start.execute!({ slug: "intro" }, {} as never);
    expect(h.setUserState).toHaveBeenCalledWith(
      expect.anything(),
      "progress",
      { "guide:intro:step": 0 },
      { source: "system" },
    );
  });

  it("guide_advance moves the pointer forward one step", async () => {
    h.getUserState.mockResolvedValue({ data: { "guide:intro:step": 0 } });
    const t = await tools();
    const out = (await t.guide_advance.execute!(
      { slug: "intro", answer: "ok" },
      {} as never,
    )) as { advanced: boolean; step?: { id: string } };
    expect(out.advanced).toBe(true);
    expect(out.step?.id).toBe("b");
    expect(h.setUserState).toHaveBeenCalledWith(
      expect.anything(),
      "progress",
      { "guide:intro:step": 1 },
      { source: "system" },
    );
  });

  it("keyword steps do not advance without the keyword", async () => {
    const kw: GuideConfig = {
      ...GUIDE,
      steps: [
        {
          id: "a",
          title: "One",
          instruction: "say yes",
          advance: "keyword",
          keyword: "yes",
        },
        GUIDE.steps[1],
      ],
    };
    h.listGuides.mockResolvedValue([kw]);
    h.getGuide.mockResolvedValue({ guide: kw, sha: "s1" });
    h.getUserState.mockResolvedValue({ data: { "guide:intro:step": 0 } });
    const t = await tools();
    const out = (await t.guide_advance.execute!(
      { slug: "intro", answer: "no" },
      {} as never,
    )) as { advanced: boolean };
    expect(out.advanced).toBe(false);
    expect(h.setUserState).not.toHaveBeenCalled();
  });

  it("returns no tools when there are no enabled guides", async () => {
    h.listGuides.mockResolvedValue([{ ...GUIDE, enabled: false }]);
    expect(Object.keys(await tools())).toEqual([]);
  });
});

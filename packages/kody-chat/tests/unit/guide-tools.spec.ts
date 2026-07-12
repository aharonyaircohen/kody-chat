/**
 * Unit tests for the guide chat tools
 * (app/api/kody/chat/tools/guide-tools.ts): steps are read from the CMS
 * collection, the model only sees the current step, and advancing moves the
 * per-student id pointer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { Octokit } from "@octokit/rest";

const h = vi.hoisted(() => ({
  listGuides: vi.fn(),
  getGuide: vi.fn(),
  listCmsDocuments: vi.fn(),
  getUserState: vi.fn(),
  setUserState: vi.fn(),
}));

vi.mock("@kody-ade/base/guides", async () => {
  const actual =
    await vi.importActual<typeof import("@kody-ade/base/guides")>(
      "@kody-ade/base/guides",
    );
  return { ...actual, listGuides: h.listGuides, getGuide: h.getGuide };
});
vi.mock("@kody-ade/cms/service", () => ({
  listCmsDocuments: h.listCmsDocuments,
}));
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
  source: {
    collection: "lessons",
    orderField: "order",
    idField: "id",
    titleField: "title",
    instructionField: "instruction",
    defaultAdvance: "model",
  },
};

const STEP_DOCS = [
  { id: "a", order: 1, title: "One", instruction: "teach one" },
  { id: "b", order: 2, title: "Two", instruction: "teach two" },
];

const ctx = {
  req: {} as NextRequest,
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
  h.listCmsDocuments.mockResolvedValue({
    docs: STEP_DOCS,
    total: 2,
    limit: 100,
    offset: 0,
  });
  h.getUserState.mockResolvedValue({ data: {} });
  h.setUserState.mockResolvedValue({});
});

describe("guide tools", () => {
  it("reads steps from the CMS collection, sorted by the order field", async () => {
    const t = await tools();
    await t.guide_start.execute!({ slug: "intro" }, {} as never);
    expect(h.listCmsDocuments).toHaveBeenCalledWith(
      ctx.req,
      ctx.octokit,
      "acme",
      "shop",
      "lessons",
      expect.objectContaining({
        sort: [{ field: "order", direction: "asc" }],
      }),
    );
  });

  it("guide_start sets the pointer to the first step's id", async () => {
    const t = await tools();
    await t.guide_start.execute!({ slug: "intro" }, {} as never);
    expect(h.setUserState).toHaveBeenCalledWith(
      expect.anything(),
      "progress",
      { "guide:intro:step": "a" },
      { source: "system" },
    );
  });

  it("guide_current returns only the current step, never later ones", async () => {
    h.getUserState.mockResolvedValue({ data: { "guide:intro:step": "a" } });
    const t = await tools();
    const out = (await t.guide_current.execute!(
      { slug: "intro" },
      {} as never,
    )) as { step?: { id: string }; stepNumber: number };
    expect(out.step?.id).toBe("a");
    expect(out.stepNumber).toBe(1);
    expect(JSON.stringify(out)).not.toContain("teach two");
  });

  it("guide_advance moves the pointer to the next step's id", async () => {
    h.getUserState.mockResolvedValue({ data: { "guide:intro:step": "a" } });
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
      { "guide:intro:step": "b" },
      { source: "system" },
    );
  });

  it("keyword steps do not advance without the keyword", async () => {
    const kwGuide: GuideConfig = {
      ...GUIDE,
      source: { ...GUIDE.source, defaultAdvance: "keyword" },
    };
    h.listGuides.mockResolvedValue([kwGuide]);
    h.getGuide.mockResolvedValue({ guide: kwGuide, sha: "s1" });
    h.listCmsDocuments.mockResolvedValue({
      docs: [{ id: "a", order: 1, title: "One", instruction: "say yes" }],
      total: 1,
      limit: 100,
      offset: 0,
    });
    h.getUserState.mockResolvedValue({ data: { "guide:intro:step": "a" } });
    // No keywordField configured, so keyword steps never pass — safe default.
    const t = await tools();
    const out = (await t.guide_advance.execute!(
      { slug: "intro", answer: "whatever" },
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

/**
 * Unit tests for the guides store (@kody-ade/base/guides/store):
 * list/get, CAS save, and delete.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Octokit } from "@octokit/rest";

const h = vi.hoisted(() => ({
  readStateText: vi.fn(),
  writeStateText: vi.fn(),
  deleteStateFile: vi.fn(),
  listStateDirectory: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@kody-ade/base/state-repo", () => ({
  readStateText: h.readStateText,
  writeStateText: h.writeStateText,
  deleteStateFile: h.deleteStateFile,
  listStateDirectory: h.listStateDirectory,
}));
vi.mock("@kody-ade/base/logger", () => ({ logger: h.logger }));

import {
  getGuide,
  listGuides,
  saveGuide,
  deleteGuide,
  _resetGuidesCache,
} from "@kody-ade/base/guides/store";
import type { GuideConfig } from "@kody-ade/base/guides/types";

const octokit = {} as Octokit;

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

beforeEach(() => {
  vi.clearAllMocks();
  _resetGuidesCache();
});

describe("listGuides", () => {
  it("loads each guide file in the dir and caches", async () => {
    h.listStateDirectory.mockResolvedValue({
      entries: [{ name: "intro.json", type: "file" }],
    });
    h.readStateText.mockResolvedValue({
      content: JSON.stringify(GUIDE),
      sha: "s1",
      path: "p",
    });
    const guides = await listGuides(octokit, "acme", "shop");
    expect(guides.map((l) => l.slug)).toEqual(["intro"]);
    await listGuides(octokit, "acme", "shop");
    expect(h.listStateDirectory).toHaveBeenCalledTimes(1);
  });

  it("returns [] when the dir does not exist", async () => {
    h.listStateDirectory.mockRejectedValue({ status: 404 });
    expect(await listGuides(octokit, "acme", "shop")).toEqual([]);
  });
});

describe("getGuide", () => {
  it("returns null on 404", async () => {
    h.readStateText.mockRejectedValue({ status: 404 });
    expect(await getGuide(octokit, "acme", "shop", "nope")).toBeNull();
  });
});

describe("saveGuide", () => {
  it("writes with the existing sha", async () => {
    h.readStateText.mockResolvedValue({
      content: JSON.stringify(GUIDE),
      sha: "old",
      path: "p",
    });
    h.writeStateText.mockResolvedValue({ sha: "new", path: "p", htmlUrl: null });
    await saveGuide(octokit, "acme", "shop", GUIDE);
    expect(h.writeStateText).toHaveBeenCalledWith(
      expect.objectContaining({
        sha: "old",
        path: "guides/intro.json",
        maxAttempts: 1,
      }),
    );
  });
});

describe("deleteGuide", () => {
  it("returns false when the guide does not exist", async () => {
    h.readStateText.mockRejectedValue({ status: 404 });
    expect(await deleteGuide(octokit, "acme", "shop", "nope")).toBe(false);
    expect(h.deleteStateFile).not.toHaveBeenCalled();
  });

  it("deletes with the file sha", async () => {
    h.readStateText.mockResolvedValue({
      content: JSON.stringify(GUIDE),
      sha: "s1",
      path: "p",
    });
    expect(await deleteGuide(octokit, "acme", "shop", "intro")).toBe(true);
    expect(h.deleteStateFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: "guides/intro.json", sha: "s1" }),
    );
  });
});

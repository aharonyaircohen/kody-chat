/**
 * Unit tests for the lessons store (@kody-ade/base/lessons/store):
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
  getLesson,
  listLessons,
  saveLesson,
  deleteLesson,
  _resetLessonsCache,
} from "@kody-ade/base/lessons/store";
import type { LessonConfig } from "@kody-ade/base/lessons/types";

const octokit = {} as Octokit;

const LESSON: LessonConfig = {
  slug: "intro",
  title: "Intro",
  description: "",
  enabled: true,
  steps: [{ id: "a", title: "One", instruction: "teach", advance: "model" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  _resetLessonsCache();
});

describe("listLessons", () => {
  it("loads each lesson file in the dir and caches", async () => {
    h.listStateDirectory.mockResolvedValue({
      entries: [{ name: "intro.json", type: "file" }],
    });
    h.readStateText.mockResolvedValue({
      content: JSON.stringify(LESSON),
      sha: "s1",
      path: "p",
    });
    const lessons = await listLessons(octokit, "acme", "shop");
    expect(lessons.map((l) => l.slug)).toEqual(["intro"]);
    await listLessons(octokit, "acme", "shop");
    expect(h.listStateDirectory).toHaveBeenCalledTimes(1);
  });

  it("returns [] when the dir does not exist", async () => {
    h.listStateDirectory.mockRejectedValue({ status: 404 });
    expect(await listLessons(octokit, "acme", "shop")).toEqual([]);
  });
});

describe("getLesson", () => {
  it("returns null on 404", async () => {
    h.readStateText.mockRejectedValue({ status: 404 });
    expect(await getLesson(octokit, "acme", "shop", "nope")).toBeNull();
  });
});

describe("saveLesson", () => {
  it("writes with the existing sha", async () => {
    h.readStateText.mockResolvedValue({
      content: JSON.stringify(LESSON),
      sha: "old",
      path: "p",
    });
    h.writeStateText.mockResolvedValue({ sha: "new", path: "p", htmlUrl: null });
    await saveLesson(octokit, "acme", "shop", LESSON);
    expect(h.writeStateText).toHaveBeenCalledWith(
      expect.objectContaining({
        sha: "old",
        path: "lessons/intro.json",
        maxAttempts: 1,
      }),
    );
  });
});

describe("deleteLesson", () => {
  it("returns false when the lesson does not exist", async () => {
    h.readStateText.mockRejectedValue({ status: 404 });
    expect(await deleteLesson(octokit, "acme", "shop", "nope")).toBe(false);
    expect(h.deleteStateFile).not.toHaveBeenCalled();
  });

  it("deletes with the file sha", async () => {
    h.readStateText.mockResolvedValue({
      content: JSON.stringify(LESSON),
      sha: "s1",
      path: "p",
    });
    expect(await deleteLesson(octokit, "acme", "shop", "intro")).toBe(true);
    expect(h.deleteStateFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: "lessons/intro.json", sha: "s1" }),
    );
  });
});

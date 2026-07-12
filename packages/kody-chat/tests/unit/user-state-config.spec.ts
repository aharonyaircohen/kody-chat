/**
 * Unit tests for the user-state namespace config loader
 * (src/dashboard/lib/user-state/config.ts): core always present, brand
 * config merged, core-name collisions ignored, invalid config ignored.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Octokit } from "@octokit/rest";

const h = vi.hoisted(() => ({
  readStateText: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@kody-ade/base/state-repo", () => ({
  readStateText: h.readStateText,
  writeStateText: vi.fn(),
}));
vi.mock("@kody-ade/base/logger", () => ({ logger: h.logger }));

import {
  getUserStateNamespaces,
  getUserStateNamespace,
  _resetUserStateConfigCache,
} from "@dashboard/lib/user-state/config";

const octokit = {} as Octokit;
const CORE_NAMES = ["profile", "progress", "selections", "stats"];

function mockConfig(config: unknown): void {
  h.readStateText.mockResolvedValue({
    content: JSON.stringify(config),
    sha: "abc",
    path: "user-state/config.json",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetUserStateConfigCache();
});

describe("getUserStateNamespaces", () => {
  it("returns only core namespaces when no brand config exists", async () => {
    h.readStateText.mockRejectedValue({ status: 404 });
    const namespaces = await getUserStateNamespaces(octokit, "acme", "shop");
    expect(namespaces.map((ns) => ns.name)).toEqual(CORE_NAMES);
    expect(namespaces.every((ns) => ns.origin === "core")).toBe(true);
  });

  it("merges valid brand namespaces after core", async () => {
    mockConfig({
      namespaces: [
        {
          name: "quiz_results",
          modelWritable: true,
          fields: [{ name: "score", type: "number", required: true }],
        },
      ],
    });
    const namespaces = await getUserStateNamespaces(octokit, "acme", "shop");
    expect(namespaces.map((ns) => ns.name)).toEqual([
      ...CORE_NAMES,
      "quiz_results",
    ]);
    const quiz = namespaces.at(-1)!;
    expect(quiz.origin).toBe("brand");
    expect(quiz.schema.safeParse({ score: 5 }).success).toBe(true);
    expect(quiz.schema.safeParse({}).success).toBe(false);
  });

  it("ignores brand namespaces colliding with core names", async () => {
    mockConfig({
      namespaces: [
        { name: "profile", fields: [{ name: "x", type: "string" }] },
      ],
    });
    const namespaces = await getUserStateNamespaces(octokit, "acme", "shop");
    expect(namespaces.filter((ns) => ns.name === "profile")).toHaveLength(1);
    expect(
      namespaces.find((ns) => ns.name === "profile")?.origin,
    ).toBe("core");
    expect(h.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: "profile" }),
      expect.stringContaining("collision"),
    );
  });

  it("ignores an invalid config file entirely", async () => {
    mockConfig({ namespaces: [{ name: "BAD NAME", fields: [] }] });
    const namespaces = await getUserStateNamespaces(octokit, "acme", "shop");
    expect(namespaces.map((ns) => ns.name)).toEqual(CORE_NAMES);
    expect(h.logger.warn).toHaveBeenCalled();
  });

  it("caches per owner/repo", async () => {
    h.readStateText.mockRejectedValue({ status: 404 });
    await getUserStateNamespaces(octokit, "acme", "shop");
    await getUserStateNamespaces(octokit, "acme", "shop");
    expect(h.readStateText).toHaveBeenCalledTimes(1);
    await getUserStateNamespaces(octokit, "acme", "other");
    expect(h.readStateText).toHaveBeenCalledTimes(2);
  });
});

describe("getUserStateNamespace", () => {
  it("finds a namespace by name and returns null for unknown", async () => {
    h.readStateText.mockRejectedValue({ status: 404 });
    expect(
      (await getUserStateNamespace(octokit, "acme", "shop", "stats"))?.name,
    ).toBe("stats");
    expect(
      await getUserStateNamespace(octokit, "acme", "shop", "nope"),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { searchMemoryFiles } from "../../src/memory/search";

describe("searchMemoryFiles", () => {
  const memories = [
    {
      id: "release",
      meta: {
        name: "Release process",
        description: "How production ships",
        type: "project" as const,
        created: "2026-01-01T00:00:00.000Z",
      },
      body: "Verify the deployment before announcing completion.",
      sha: "",
      updatedAt: "2026-01-01T00:00:00.000Z",
      htmlUrl: "",
    },
  ];

  it("searches memory metadata and body", () => {
    expect(searchMemoryFiles(memories, "deployment")).toEqual([
      expect.objectContaining({ id: "release", path: "memory/release.md" }),
    ]);
  });

  it("is case-insensitive", () => {
    expect(searchMemoryFiles(memories, "PRODUCTION")).toHaveLength(1);
  });

  it("returns no matches for an empty query", () => {
    expect(searchMemoryFiles(memories, "   ")).toEqual([]);
  });
});

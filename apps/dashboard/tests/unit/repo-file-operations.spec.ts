import type { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vitest";

import { deleteRepositoryPath } from "@dashboard/features/file-manager/lib/repo-file-operations";

describe("deleteRepositoryPath", () => {
  it("deletes a single file through the GitHub Contents API using its current sha", async () => {
    const getContent = vi.fn().mockResolvedValue({
      data: {
        type: "file",
        path: "moved.md",
        sha: "blob-current",
        size: 0,
        encoding: "base64",
        content: "",
      },
    });
    const deleteFile = vi.fn().mockResolvedValue({ data: {} });
    const octokit = {
      rest: { repos: { getContent, deleteFile } },
    } as unknown as Octokit;

    await expect(
      deleteRepositoryPath(octokit, "acme", "repo", "moved.md", "file"),
    ).resolves.toEqual([]);

    expect(deleteFile).toHaveBeenCalledWith({
      owner: "acme",
      repo: "repo",
      path: "moved.md",
      sha: "blob-current",
      message: "chore: delete moved.md",
    });
  });
});

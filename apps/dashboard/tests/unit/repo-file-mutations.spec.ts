import type { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vitest";
import {
  commitFileChanges,
  type RepositoryFileChange,
} from "@dashboard/features/file-manager/lib/repo-file-mutations";

function createOctokitMock() {
  const createBlob = vi
    .fn()
    .mockResolvedValueOnce({ data: { sha: "blob-a" } })
    .mockResolvedValueOnce({ data: { sha: "blob-b" } });
  const createTree = vi.fn().mockResolvedValue({ data: { sha: "tree-next" } });
  const createCommit = vi
    .fn()
    .mockResolvedValue({ data: { sha: "commit-next" } });
  const updateRef = vi.fn().mockResolvedValue({ data: {} });

  const octokit = {
    rest: {
      repos: {
        get: vi.fn().mockResolvedValue({
          data: { default_branch: "main" },
        }),
      },
      git: {
        getRef: vi.fn().mockResolvedValue({
          data: { object: { sha: "commit-base" } },
        }),
        getCommit: vi.fn().mockResolvedValue({
          data: { tree: { sha: "tree-base" } },
        }),
        createBlob,
        createTree,
        createCommit,
        updateRef,
      },
    },
  } as unknown as Octokit;

  return { octokit, createBlob, createTree, createCommit, updateRef };
}

describe("commitFileChanges", () => {
  it("writes and deletes many files in one repository commit", async () => {
    const { octokit, createBlob, createTree, createCommit, updateRef } =
      createOctokitMock();
    const changes: RepositoryFileChange[] = [
      { type: "write", path: "docs/a.md", base64Content: "YQ==" },
      { type: "write", path: "docs/b.bin", base64Content: "AP8=" },
      { type: "delete", path: "old/a.md" },
    ];

    const result = await commitFileChanges(
      octokit,
      "acme",
      "repo",
      "chore: move files",
      changes,
    );

    expect(createBlob).toHaveBeenCalledTimes(2);
    expect(createTree).toHaveBeenCalledOnce();
    expect(createTree).toHaveBeenCalledWith({
      owner: "acme",
      repo: "repo",
      base_tree: "tree-base",
      tree: [
        { path: "docs/a.md", mode: "100644", type: "blob", sha: "blob-a" },
        { path: "docs/b.bin", mode: "100644", type: "blob", sha: "blob-b" },
        { path: "old/a.md", mode: "100644", type: "blob", sha: null },
      ],
    });
    expect(createCommit).toHaveBeenCalledOnce();
    expect(updateRef).toHaveBeenCalledOnce();
    expect(result.commitSha).toBe("commit-next");
  });

  it("rejects duplicate paths before changing GitHub", async () => {
    const { octokit, createBlob } = createOctokitMock();

    await expect(
      commitFileChanges(octokit, "acme", "repo", "bad change", [
        { type: "delete", path: "same.md" },
        { type: "write", path: "same.md", base64Content: "YQ==" },
      ]),
    ).rejects.toThrow("Duplicate repository path");

    expect(createBlob).not.toHaveBeenCalled();
  });

  it("rebuilds the commit on the latest head after a non-fast-forward race", async () => {
    const { octokit, createBlob, createTree, createCommit, updateRef } =
      createOctokitMock();
    const git = octokit.rest.git;
    vi.mocked(git.getRef)
      .mockResolvedValueOnce({
        data: { object: { sha: "commit-base" } },
      } as never)
      .mockResolvedValueOnce({
        data: { object: { sha: "commit-new-head" } },
      } as never);
    updateRef
      .mockRejectedValueOnce({
        status: 422,
        message: "Update is not a fast forward",
      })
      .mockResolvedValueOnce({ data: {} });

    await expect(
      commitFileChanges(octokit, "acme", "repo", "delete folder", [
        { type: "delete", path: "notes/archive/.gitkeep" },
      ]),
    ).resolves.toMatchObject({ commitSha: "commit-next" });

    expect(createBlob).not.toHaveBeenCalled();
    expect(createTree).toHaveBeenCalledTimes(2);
    expect(createCommit).toHaveBeenCalledTimes(2);
    expect(updateRef).toHaveBeenCalledTimes(2);
  });

  it("rebuilds a deletion when GitHub briefly returns a stale tree", async () => {
    const { octokit, createTree, createCommit, updateRef } = createOctokitMock();
    createTree
      .mockRejectedValueOnce({
        status: 422,
        message: "GitRPC::BadObjectState",
      })
      .mockResolvedValueOnce({ data: { sha: "tree-next" } });

    await expect(
      commitFileChanges(octokit, "acme", "repo", "delete moved file", [
        { type: "delete", path: "moved.md" },
      ]),
    ).resolves.toMatchObject({ commitSha: "commit-next" });

    expect(createTree).toHaveBeenCalledTimes(2);
    expect(createCommit).toHaveBeenCalledOnce();
    expect(updateRef).toHaveBeenCalledOnce();
  });
});

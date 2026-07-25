import { describe, expect, it, vi } from "vitest";

import {
  deleteRepositoryLoop,
  listRepositoryLoops,
  readRepositoryLoop,
  saveRepositoryLoop,
} from "@dashboard/lib/repository-loops";

const loop = {
  id: "ci-repair",
  trigger: { type: "schedule" as const, every: "15m" },
  target: { kind: "workflow" as const, id: "ci-repair" },
  input: {},
  enabled: true,
};

function file(value = loop, sha = "file-sha") {
  return {
    data: {
      type: "file",
      sha,
      content: Buffer.from(JSON.stringify(value)).toString("base64"),
      html_url: "https://github.test/loop",
    },
  };
}

describe("repository loops", () => {
  it("lists valid Loop definitions from the consumer runtime folder", async () => {
    const getContent = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ type: "dir", name: "ci-repair" }],
      })
      .mockResolvedValueOnce(file());
    const octokit = { repos: { getContent } } as never;

    await expect(listRepositoryLoops(octokit, "o", "r")).resolves.toEqual([
      loop,
    ]);
  });

  it("returns null for a missing Loop", async () => {
    const octokit = {
      repos: {
        getContent: vi.fn().mockRejectedValue({ status: 404 }),
      },
    } as never;

    await expect(
      readRepositoryLoop(octokit, "o", "r", "missing"),
    ).resolves.toBeNull();
  });

  it("writes a Loop to the repository definition path", async () => {
    const createOrUpdateFileContents = vi.fn().mockResolvedValue({
      data: { content: { sha: "new" }, commit: { sha: "commit" } },
    });
    const octokit = {
      repos: {
        getContent: vi.fn().mockRejectedValue({ status: 404 }),
        createOrUpdateFileContents,
      },
    } as never;

    await expect(
      saveRepositoryLoop(octokit, "o", "r", loop, "add loop"),
    ).resolves.toMatchObject({ loop, created: true });
    expect(createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({
        path: ".kody-engine/runtime/loops/ci-repair/loop.json",
        message: "add loop",
      }),
    );
  });

  it("deletes the exact repository definition file", async () => {
    const deleteFile = vi.fn().mockResolvedValue({ data: {} });
    const octokit = {
      repos: {
        getContent: vi.fn().mockResolvedValue(file()),
        deleteFile,
      },
    } as never;

    await expect(
      deleteRepositoryLoop(octokit, "o", "r", "ci-repair", "remove loop"),
    ).resolves.toBe(true);
    expect(deleteFile).toHaveBeenCalledWith({
      owner: "o",
      repo: "r",
      path: ".kody-engine/runtime/loops/ci-repair/loop.json",
      message: "remove loop",
      sha: "file-sha",
    });
  });
});

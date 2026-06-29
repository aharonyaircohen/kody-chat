import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dashboard/lib/engine/config", () => ({
  getEngineConfig: vi.fn().mockResolvedValue({
    config: {
      state: { repo: "https://github.com/acme/kody-state", path: "widgets" },
    },
    sha: null,
  }),
}));

import { STATE_BRANCH } from "@dashboard/lib/state-branch";
import { readStateText, writeStateText } from "@dashboard/lib/state-repo";

type ReadOctokit = Parameters<typeof readStateText>[0];
type WriteOctokit = Parameters<typeof writeStateText>[0]["octokit"];

function b64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function octokitForRead() {
  return {
    repos: {
      getContent: vi.fn().mockResolvedValue({
        data: {
          type: "file",
          encoding: "base64",
          content: b64("hello"),
          sha: "file-sha",
        },
        headers: {},
      }),
    },
  };
}

function octokitForWrite() {
  return {
    repos: {
      get: vi.fn().mockResolvedValue({ data: { default_branch: "main" } }),
      createOrUpdateFileContents: vi.fn().mockResolvedValue({
        data: { content: { sha: "file-sha" }, commit: { sha: "commit-sha" } },
      }),
    },
    git: {
      getRef: vi.fn().mockResolvedValue({
        data: { object: { sha: "main-sha" } },
      }),
      createRef: vi.fn().mockResolvedValue({}),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("state repo branch", () => {
  it("reads runtime state from the state repo main branch", async () => {
    const octokit = octokitForRead();

    const file = await readStateText(
      octokit as unknown as ReadOctokit,
      "acme",
      "widgets",
      "reports/check.md",
    );

    expect(file?.content).toBe("hello");
    expect(STATE_BRANCH).toBe("main");
    expect(octokit.repos.getContent).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "acme",
        repo: "kody-state",
        path: "widgets/reports/check.md",
        ref: STATE_BRANCH,
      }),
    );
  });

  it("writes runtime state to the state repo main branch", async () => {
    const octokit = octokitForWrite();

    await writeStateText({
      octokit: octokit as unknown as WriteOctokit,
      owner: "acme",
      repo: "widgets",
      path: "reports/check.md",
      content: "hello",
      message: "save report",
    });

    expect(octokit.git.getRef).toHaveBeenCalledWith({
      owner: "acme",
      repo: "kody-state",
      ref: `heads/${STATE_BRANCH}`,
    });
    expect(octokit.git.createRef).not.toHaveBeenCalled();
    expect(octokit.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "acme",
        repo: "kody-state",
        path: "widgets/reports/check.md",
        branch: STATE_BRANCH,
        message: "save report",
      }),
    );
  });
});

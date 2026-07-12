import { beforeEach, describe, expect, it, vi } from "vitest";

const stateRepo = vi.hoisted(() => ({
  listStateDirectory: vi.fn(),
  readStateText: vi.fn(),
}));

vi.mock("@kody-ade/base/state-repo", () => stateRepo);

import { listAgencyState } from "@kody-ade/agency/observation-store";

describe("agency observation store", () => {
  beforeEach(() => {
    stateRepo.listStateDirectory.mockReset();
    stateRepo.readStateText.mockReset();
  });

  it("reads and validates records from the agency state directories", async () => {
    stateRepo.listStateDirectory.mockResolvedValue({
      entries: [
        { name: "finding-ci.json", path: "agency/findings/finding-ci.json", type: "file" },
        { name: "notes.md", path: "agency/findings/notes.md", type: "file" },
      ],
      targetPath: "kody-chat/agency/findings",
    });
    stateRepo.readStateText.mockResolvedValue({
      path: "kody-chat/agency/findings/finding-ci.json",
      sha: "abc",
      content: JSON.stringify({
        version: 1,
        id: "finding-ci",
        observerId: "agency-observer",
        subject: "repo-ci:main",
        title: "Default branch CI is failing",
        expectation: "Default branch CI is green",
        actual: "Default branch CI is failing",
        severity: "high",
        status: "open",
        phase: "observed",
        observationIds: ["obs-ci-main"],
        createdAt: "2026-07-12T10:00:00.000Z",
        updatedAt: "2026-07-12T10:00:00.000Z",
      }),
    });

    const result = await listAgencyState({
      octokit: {} as never,
      owner: "A-Guy",
      repo: "kody-chat",
      model: "findings",
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.id).toBe("finding-ci");
    expect(stateRepo.listStateDirectory).toHaveBeenCalledWith(
      expect.anything(),
      "A-Guy",
      "kody-chat",
      "agency/findings",
    );
  });

  it("ignores invalid records instead of breaking the operator view", async () => {
    stateRepo.listStateDirectory.mockResolvedValue({
      entries: [{ name: "bad.json", path: "agency/learnings/bad.json", type: "file" }],
      targetPath: "kody-chat/agency/learnings",
    });
    stateRepo.readStateText.mockResolvedValue({
      path: "kody-chat/agency/learnings/bad.json",
      sha: "bad",
      content: "{}",
    });

    const result = await listAgencyState({
      octokit: {} as never,
      owner: "A-Guy",
      repo: "kody-chat",
      model: "learnings",
    });

    expect(result.records).toEqual([]);
    expect(result.invalidCount).toBe(1);
  });
});

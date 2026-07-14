/** @fileoverview Storage and catalog tests for persisted Operations. */
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  listStateDirectory: vi.fn(),
  readStateText: vi.fn(),
  writeStateText: vi.fn(),
  deleteStateFile: vi.fn(),
  listManagedGoalFiles: vi.fn(),
}));

vi.mock("@kody-ade/base/state-repo", () => ({
  listStateDirectory: h.listStateDirectory,
  readStateText: h.readStateText,
  writeStateText: h.writeStateText,
  deleteStateFile: h.deleteStateFile,
}));

vi.mock("@dashboard/lib/managed-goals-files", () => ({
  listManagedGoalFiles: h.listManagedGoalFiles,
}));

import {
  deleteOperationFile,
  listOperationFiles,
  loadOperationCatalog,
  readOperationFile,
  writeOperationFile,
} from "../../src/dashboard/lib/operation-files";
import { buildOperation } from "@kody-ade/agency/operations";

const octokit = {} as never;
const operation = buildOperation(
  {
    id: "release",
    name: "Release",
    responsibility: "Ship approved changes safely.",
    doesNotOwn: ["Product priority"],
    intentIds: ["reliable-delivery"],
    goals: ["web-release"],
    loops: ["deployment-health"],
  },
  "2026-07-14T10:00:00.000Z",
);

afterEach(() => vi.clearAllMocks());

describe("operation state files", () => {
  it("lists valid Operations and skips malformed files", async () => {
    h.listStateDirectory.mockResolvedValue({
      entries: [
        { type: "dir", name: "release" },
        { type: "dir", name: "broken" },
        { type: "file", name: "notes.txt" },
      ],
    });
    h.readStateText.mockImplementation(async (_o, _owner, _repo, path) => {
      if (path.includes("broken")) {
        return { path, content: "{}", sha: "broken-sha" };
      }
      return {
        path,
        content: JSON.stringify(operation),
        sha: "release-sha",
      };
    });

    const records = await listOperationFiles(octokit, "acme", "app");

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: "release",
      sha: "release-sha",
      operation: { id: "release" },
    });
  });

  it("reads, version-writes, and deletes one predictable file", async () => {
    h.readStateText.mockResolvedValue({
      path: "app/operations/release/operation.json",
      content: JSON.stringify(operation),
      sha: "release-sha",
    });

    const record = await readOperationFile(octokit, "acme", "app", "release");
    await writeOperationFile({
      octokit,
      owner: "acme",
      repo: "app",
      operation,
      sha: record?.sha,
    });
    await deleteOperationFile({
      octokit,
      owner: "acme",
      repo: "app",
      id: "release",
      sha: "release-sha",
    });

    expect(h.writeStateText).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "operations/release/operation.json",
        sha: "release-sha",
      }),
    );
    expect(h.deleteStateFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "operations/release/operation.json",
        sha: "release-sha",
      }),
    );
  });

  it("builds activation catalog from active Intents and instantiated work", async () => {
    h.listStateDirectory.mockResolvedValue({
      entries: [
        { type: "dir", name: "reliable-delivery" },
        { type: "file", name: "README.md" },
      ],
    });
    h.readStateText.mockResolvedValue({
      path: "app/intents/reliable-delivery/intent.json",
      content: JSON.stringify({
        id: "reliable-delivery",
        status: "active",
        for: "Reliable delivery",
        policy: { automation: { authority: "full-auto" } },
      }),
      sha: "intent-sha",
    });
    h.listManagedGoalFiles.mockResolvedValue([
      {
        id: "web-release",
        state: {
          scheduleMode: "manual",
          type: "release",
          route: [{}],
          destination: { evidence: [] },
        },
      },
      {
        id: "deployment-health",
        state: {
          scheduleMode: "agentLoop",
          type: "agentLoop",
          route: [],
          destination: { evidence: [] },
        },
      },
    ]);

    await expect(loadOperationCatalog(octokit, "acme", "app")).resolves.toEqual(
      {
        intents: ["reliable-delivery"],
        goals: ["web-release"],
        loops: ["deployment-health"],
      },
    );
  });
});

/**
 * Storage and catalog tests for persisted Operations on the Convex backend
 * (repoDocs kind `operation:<id>`, listed via repoDocs.listByPrefix).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";

const convex = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
}));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query = convex.query;
    mutation = convex.mutation;
  },
}));

const h = vi.hoisted(() => ({
  listManagedGoalFiles: vi.fn(),
  listCompanyIntentRecords: vi.fn(),
}));

vi.mock("@dashboard/lib/managed-goals-files", () => ({
  listManagedGoalFiles: h.listManagedGoalFiles,
}));

vi.mock("@dashboard/lib/company-intents-store", () => ({
  listCompanyIntentRecords: h.listCompanyIntentRecords,
}));

import { _resetConvexClient } from "@dashboard/lib/backend/convex-backend";
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

beforeEach(() => {
  vi.clearAllMocks();
  _resetConvexClient();
  process.env.CONVEX_URL = "https://example.convex.cloud";
});

describe("operation convex store", () => {
  it("lists valid Operations via repoDocs.listByPrefix and skips malformed docs", async () => {
    convex.query.mockResolvedValue([
      { kind: "operation:release", doc: operation },
      { kind: "operation:broken", doc: {} },
    ]);

    const records = await listOperationFiles(octokit, "acme", "app");

    const [ref, args] = convex.query.mock.calls[0]!;
    expect(getFunctionName(ref)).toBe("repoDocs:listByPrefix");
    expect(args).toEqual({ tenantId: "acme/app", prefix: "operation:" });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: "release",
      sha: "",
      operation: { id: "release" },
    });
  });

  it("reads, writes, and deletes one repoDocs kind per operation", async () => {
    convex.query.mockResolvedValue({
      kind: "operation:release",
      doc: operation,
    });
    convex.mutation.mockResolvedValue(null);

    const record = await readOperationFile(octokit, "acme", "app", "release");
    expect(record?.operation.id).toBe("release");
    const [readRef, readArgs] = convex.query.mock.calls[0]!;
    expect(getFunctionName(readRef)).toBe("repoDocs:get");
    expect(readArgs).toEqual({
      tenantId: "acme/app",
      kind: "operation:release",
    });

    await writeOperationFile({ octokit, owner: "acme", repo: "app", operation });
    const [saveRef, saveArgs] = convex.mutation.mock.calls[0]!;
    expect(getFunctionName(saveRef)).toBe("repoDocs:save");
    expect(saveArgs).toMatchObject({
      tenantId: "acme/app",
      kind: "operation:release",
      doc: operation,
    });

    await deleteOperationFile({ octokit, owner: "acme", repo: "app", id: "release" });
    const [removeRef, removeArgs] = convex.mutation.mock.calls[1]!;
    expect(getFunctionName(removeRef)).toBe("repoDocs:remove");
    expect(removeArgs).toEqual({
      tenantId: "acme/app",
      kind: "operation:release",
    });
  });

  it("returns null for unknown or invalid operation ids", async () => {
    convex.query.mockResolvedValue(null);
    expect(await readOperationFile(octokit, "acme", "app", "release")).toBeNull();
    expect(await readOperationFile(octokit, "acme", "app", "Bad Id")).toBeNull();
  });

  it("builds activation catalog from active Intents and instantiated work", async () => {
    h.listCompanyIntentRecords.mockResolvedValue([
      { id: "reliable-delivery", intent: { status: "active" } },
      { id: "paused-intent", intent: { status: "paused" } },
    ]);
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

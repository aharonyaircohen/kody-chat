import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { setup } from "./helpers";

const knowledgeGraphs = (
  api as unknown as {
    knowledgeGraphs: {
      createUpload: unknown;
      publish: unknown;
      get: unknown;
    };
  }
).knowledgeGraphs;

const TENANT = "acme/app";
const NOW = "2026-07-22T10:00:00.000Z";

async function store(
  t: ReturnType<typeof setup>,
  body: string,
  type: string,
): Promise<Id<"_storage">> {
  return await t.run(async (ctx) =>
    ctx.storage.store(new Blob([body], { type })),
  );
}

describe("knowledgeGraphs", () => {
  it("publishes one isolated graph bundle per repository tenant", async () => {
    const t = setup();
    const graphStorageId = await store(
      t,
      JSON.stringify({ nodes: [{ id: "repo" }], edges: [] }),
      "application/json",
    );
    const reportStorageId = await store(t, "# Project graph", "text/markdown");
    const htmlStorageId = await store(
      t,
      "<!doctype html><title>Project graph</title>",
      "text/html",
    );

    await t.mutation(knowledgeGraphs.publish as never, {
      tenantId: TENANT,
      graphStorageId,
      reportStorageId,
      htmlStorageId,
      generatedAt: NOW,
      sourceRevision: "abc123",
      nodeCount: 1,
      edgeCount: 0,
      schemaVersion: 1,
    });

    const stored = await t.query(knowledgeGraphs.get as never, {
      tenantId: TENANT,
    });
    const otherTenant = await t.query(knowledgeGraphs.get as never, {
      tenantId: "other/repo",
    });

    expect(stored).toMatchObject({
      tenantId: TENANT,
      graphStorageId,
      reportStorageId,
      htmlStorageId,
      generatedAt: NOW,
      sourceRevision: "abc123",
      nodeCount: 1,
      edgeCount: 0,
      schemaVersion: 1,
    });
    expect((stored as { graphUrl?: string }).graphUrl).toMatch(/^https?:\/\//);
    expect((stored as { htmlUrl?: string }).htmlUrl).toMatch(/^https?:\/\//);
    expect(otherTenant).toBeNull();
  });

  it("replaces the previous bundle and removes superseded files", async () => {
    const t = setup();
    const firstGraph = await store(
      t,
      '{"nodes":[],"edges":[]}',
      "application/json",
    );
    const secondGraph = await store(
      t,
      '{"nodes":[{"id":"new"}],"edges":[]}',
      "application/json",
    );

    await t.mutation(knowledgeGraphs.publish as never, {
      tenantId: TENANT,
      graphStorageId: firstGraph,
      generatedAt: NOW,
      nodeCount: 0,
      edgeCount: 0,
      schemaVersion: 1,
    });
    await t.mutation(knowledgeGraphs.publish as never, {
      tenantId: TENANT,
      graphStorageId: secondGraph,
      generatedAt: "2026-07-22T11:00:00.000Z",
      nodeCount: 1,
      edgeCount: 0,
      schemaVersion: 1,
    });

    const removed = await t.run(async (ctx) => ctx.db.system.get(firstGraph));
    const stored = await t.query(knowledgeGraphs.get as never, {
      tenantId: TENANT,
    });

    expect(removed).toBeNull();
    expect(stored).toMatchObject({ graphStorageId: secondGraph, nodeCount: 1 });
  });

  it("rejects a missing graph file and invalid counts", async () => {
    const t = setup();
    const missing = "kg000000000000000000000000000000" as Id<"_storage">;

    await expect(
      t.mutation(knowledgeGraphs.publish as never, {
        tenantId: TENANT,
        graphStorageId: missing,
        generatedAt: NOW,
        nodeCount: -1,
        edgeCount: 0,
        schemaVersion: 1,
      }),
    ).rejects.toThrow();
  });

  it("creates an authenticated Convex upload URL", async () => {
    const t = setup();
    const uploadUrl = await t.mutation(knowledgeGraphs.createUpload as never, {
      tenantId: TENANT,
    });

    expect(uploadUrl).toMatch(/^https?:\/\//);
  });
});

import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { setup } from "./helpers";

const chatTools = (
  api as unknown as {
    chatTools: {
      createUpload: unknown;
      publish: unknown;
      list: unknown;
      getEnabled: unknown;
      setEnabled: unknown;
      remove: unknown;
    };
  }
).chatTools;

const TENANT = "acme/app";
const NOW = "2026-07-29T10:00:00.000Z";

async function storeGraph(t: ReturnType<typeof setup>, id = "company") {
  return await t.run(async (ctx) =>
    ctx.storage.store(
      new Blob(
        [
          JSON.stringify({
            schemaVersion: 1,
            kind: "chat-knowledge-graph",
            status: "built",
            summary: "Company knowledge",
            graph: {
              nodes: [{ id, type: "company", label: "Acme", sourceIds: ["s1"] }],
              edges: [],
            },
            sources: [
              {
                id: "s1",
                kind: "repository",
                locator: "README.md",
                observedAt: NOW,
                evidence: "Acme builds software.",
              },
            ],
            coverage: [],
            gaps: [],
          }),
        ],
        { type: "application/json" },
      ),
    ),
  );
}

describe("chatTools", () => {
  it("publishes a new repository tool disabled by default", async () => {
    const t = setup();
    const dataStorageId = await storeGraph(t);

    await t.mutation(chatTools.publish as never, {
      tenantId: TENANT,
      toolId: "company-understanding",
      name: "search_company_knowledge",
      title: "Company knowledge",
      description: "Search verified company and project facts.",
      handlerKind: "knowledge_graph_search",
      dataStorageId,
      dataSchemaVersion: 1,
      sourceWorkflow: "build-chat-knowledge-graph",
      generatedAt: NOW,
      nodeCount: 1,
      edgeCount: 0,
    });

    const listed = (await t.query(chatTools.list as never, {
      tenantId: TENANT,
    })) as Array<Record<string, unknown>>;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      toolId: "company-understanding",
      name: "search_company_knowledge",
      handlerKind: "knowledge_graph_search",
      enabled: false,
    });
    expect(listed[0]).not.toHaveProperty("dataUrl");
    expect(await t.query(chatTools.getEnabled as never, { tenantId: TENANT })).toEqual(
      [],
    );
  });

  it("preserves enabled state when a workflow republishes the graph", async () => {
    const t = setup();
    const first = await storeGraph(t, "first");
    const second = await storeGraph(t, "second");
    const publication = {
      tenantId: TENANT,
      toolId: "company-understanding",
      name: "search_company_knowledge",
      title: "Company knowledge",
      description: "Search verified company and project facts.",
      handlerKind: "knowledge_graph_search",
      dataSchemaVersion: 1,
      sourceWorkflow: "build-chat-knowledge-graph",
      generatedAt: NOW,
      nodeCount: 1,
      edgeCount: 0,
    };
    await t.mutation(chatTools.publish as never, {
      ...publication,
      dataStorageId: first,
    });
    await t.mutation(chatTools.setEnabled as never, {
      tenantId: TENANT,
      toolId: publication.toolId,
      enabled: true,
    });
    await t.mutation(chatTools.publish as never, {
      ...publication,
      dataStorageId: second,
    });

    const enabled = (await t.query(chatTools.getEnabled as never, {
      tenantId: TENANT,
    })) as Array<Record<string, unknown>>;
    expect(enabled[0]).toMatchObject({ enabled: true, dataStorageId: second });
    expect(enabled[0]?.dataUrl).toMatch(/^https?:\/\//);
    expect(await t.run(async (ctx) => ctx.db.system.get(first))).toBeNull();
  });

  it("removes the record and graph file", async () => {
    const t = setup();
    const dataStorageId = await storeGraph(t);
    await t.mutation(chatTools.publish as never, {
      tenantId: TENANT,
      toolId: "company-understanding",
      name: "search_company_knowledge",
      title: "Company knowledge",
      description: "Search verified facts.",
      handlerKind: "knowledge_graph_search",
      dataStorageId,
      dataSchemaVersion: 1,
      sourceWorkflow: "build-chat-knowledge-graph",
      generatedAt: NOW,
      nodeCount: 1,
      edgeCount: 0,
    });

    await t.mutation(chatTools.remove as never, {
      tenantId: TENANT,
      toolId: "company-understanding",
    });

    expect(await t.query(chatTools.list as never, { tenantId: TENANT })).toEqual([]);
    expect(await t.run(async (ctx) => ctx.db.system.get(dataStorageId))).toBeNull();
  });

  it("rejects unsupported handlers, invalid names, and missing files", async () => {
    const t = setup();
    const missing = "kg000000000000000000000000000000" as Id<"_storage">;
    const base = {
      tenantId: TENANT,
      toolId: "company-understanding",
      name: "unsafe name",
      title: "Company knowledge",
      description: "Search verified facts.",
      handlerKind: "arbitrary_code",
      dataStorageId: missing,
      dataSchemaVersion: 1,
      sourceWorkflow: "build-chat-knowledge-graph",
      generatedAt: NOW,
      nodeCount: 1,
      edgeCount: 0,
    };
    await expect(t.mutation(chatTools.publish as never, base)).rejects.toThrow();
  });
});

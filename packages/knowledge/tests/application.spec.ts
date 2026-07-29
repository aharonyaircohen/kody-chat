import { describe, expect, it, vi } from "vitest";
import {
  InvalidKnowledgeGraphError,
  queryRepositoryKnowledge,
  type KnowledgeGraphReader,
} from "../src";

describe("Knowledge System application service", () => {
  it("loads one tenant snapshot and returns graph plus agent context", async () => {
    const reader: KnowledgeGraphReader = {
      read: vi.fn(async () => ({
        schemaVersion: 3,
        generatedAt: "2026-07-29T10:00:00Z",
        nodes: [
          {
            id: "technology:billing",
            label: "Billing service",
            type: "service",
            domain: "technology",
            summary: "Owns subscription updates.",
            sources: [{ kind: "github", id: "apps/billing" }],
          },
        ],
        edges: [],
      })),
    };

    const result = await queryRepositoryKnowledge(
      reader,
      "acme/widgets",
      { search: "billing" },
    );

    expect(reader.read).toHaveBeenCalledWith("acme/widgets");
    expect(result.context.subject?.id).toBe("technology:billing");
    expect(result.graph.nodes).toHaveLength(1);
  });

  it("rejects structurally corrupt published knowledge", async () => {
    const reader: KnowledgeGraphReader = {
      read: async () => ({
        schemaVersion: 3,
        nodes: [
          {
            id: "technology:billing",
            label: "Billing service",
            type: "service",
            domain: "technology",
            sources: [{ kind: "github", id: "apps/billing" }],
          },
        ],
        edges: [
          {
            source: "technology:billing",
            relation: "calls",
            target: "technology:missing",
            sources: [{ kind: "github", id: "apps/billing" }],
          },
        ],
      }),
    };

    await expect(
      queryRepositoryKnowledge(reader, "acme/widgets", {
        search: "billing",
      }),
    ).rejects.toBeInstanceOf(InvalidKnowledgeGraphError);
  });
});

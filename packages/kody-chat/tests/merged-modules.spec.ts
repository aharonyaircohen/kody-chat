import { describe, expect, it } from "vitest";

import {
  buildChatKnowledgeIndex,
  parseChatKnowledgeGraph,
  searchChatKnowledge,
} from "../src/knowledge";
import {
  composeChatModelCatalog,
  KODY_OPENROUTER_FREE_CHAT_MODEL,
} from "../src/model-catalog";

describe("Kody Chat owned modules", () => {
  it("owns bounded knowledge retrieval", () => {
    const graph = parseChatKnowledgeGraph({
      kind: "chat-knowledge-graph",
      status: "built",
      summary: "Kody owns chat.",
      graph: {
        nodes: [
          {
            id: "kody-chat",
            type: "product",
            label: "Kody Chat",
            sourceIds: ["repo"],
          },
        ],
        edges: [],
      },
      sources: [
        {
          id: "repo",
          kind: "repository",
          locator: "packages/kody-chat",
          observedAt: "2026-07-30T00:00:00Z",
          evidence: "The package contains the chat implementation.",
        },
      ],
      coverage: [],
      gaps: [],
    });

    const result = searchChatKnowledge(
      buildChatKnowledgeIndex(graph),
      "Which product owns chat?",
    );

    expect(result.facts.map((fact) => fact.id)).toEqual(["kody-chat"]);
    expect(result.sources.map((source) => source.id)).toEqual(["repo"]);
  });

  it("owns the built-in model catalog", () => {
    expect(
      composeChatModelCatalog([], KODY_OPENROUTER_FREE_CHAT_MODEL),
    ).toEqual([
      expect.objectContaining({ id: "openrouter/free", default: true }),
    ]);
  });
});

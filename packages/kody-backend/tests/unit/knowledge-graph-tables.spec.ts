import { describe, expect, it } from "vitest";
import { KNOWLEDGE_GRAPH_TABLES } from "../../src/table-registry";

describe("Knowledge Graph export scope", () => {
  it("includes repository-owned context and documents", () => {
    expect(KNOWLEDGE_GRAPH_TABLES).toContain("repoDocs");
  });

  it("excludes private conversation and user state", () => {
    expect(KNOWLEDGE_GRAPH_TABLES).not.toContain("conversationEntries");
    expect(KNOWLEDGE_GRAPH_TABLES).not.toContain("conversationTurns");
    expect(KNOWLEDGE_GRAPH_TABLES).not.toContain("userState");
    expect(KNOWLEDGE_GRAPH_TABLES).not.toContain("userPreferences");
  });
});

import { tool } from "ai";
import { z } from "zod";
import { api } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import {
  parseChatKnowledgeGraph,
  searchChatKnowledge,
} from "@kody-ade/knowledge";

type PublishedTool = {
  name: string;
  title: string;
  description: string;
  handlerKind: "knowledge_graph_search";
  dataUrl: string | null;
};

const querySchema = z.object({
  question: z.string().trim().min(2).max(500),
});

async function knowledgeGraphTool(definition: PublishedTool) {
  return tool({
    description:
      `${definition.description} Use it before answering questions about the ` +
      "company, product, repository, data, current work, or AI agency. " +
      "Only state facts supported by the returned evidence and say when a gap remains.",
    inputSchema: querySchema,
    execute: async ({ question }) => {
      if (!definition.dataUrl) return { error: "tool_data_unavailable" };
      const response = await fetch(definition.dataUrl, { cache: "no-store" });
      if (!response.ok) return { error: "tool_data_unavailable" };
      return searchChatKnowledge(
        parseChatKnowledgeGraph(await response.json()),
        question,
      );
    },
  });
}

export async function loadDynamicChatTools(owner: string, repo: string) {
  let definitions: PublishedTool[];
  try {
    definitions = (await createBackendClient().query(
      api.chatTools.getEnabled,
      { tenantId: `${owner}/${repo}` },
    )) as PublishedTool[];
  } catch (error) {
    console.warn(
      "[chat-tools] dynamic tools unavailable; continuing without them",
      error instanceof Error ? error.message : error,
    );
    return {};
  }
  const tools: Record<string, unknown> = {};
  for (const definition of definitions) {
    if (Object.prototype.hasOwnProperty.call(tools, definition.name)) {
      throw new Error(`Duplicate dynamic Chat tool: ${definition.name}`);
    }
    if (definition.handlerKind === "knowledge_graph_search") {
      tools[definition.name] = await knowledgeGraphTool(definition);
    }
  }
  return tools;
}

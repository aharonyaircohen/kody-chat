import { tool } from "ai";
import { z } from "zod";
import { api } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import {
  buildChatKnowledgeIndex,
  type ChatKnowledgeIndex,
  parseChatKnowledgeGraph,
  searchChatKnowledge,
} from "@kody-ade/kody-chat/knowledge";

type PublishedTool = {
  name: string;
  title: string;
  description: string;
  handlerKind: "knowledge_graph_search";
  dataStorageId: string;
  dataUrl: string | null;
};

const MAX_CACHED_KNOWLEDGE_VERSIONS = 32;
const knowledgeIndexCache = new Map<string, Promise<ChatKnowledgeIndex>>();

const querySchema = z.object({
  question: z.string().trim().min(2).max(500),
});

function rememberKnowledgeIndex(
  version: string,
  load: () => Promise<ChatKnowledgeIndex>,
): Promise<ChatKnowledgeIndex> {
  const cached = knowledgeIndexCache.get(version);
  if (cached) return cached;

  const pending = load().catch((error) => {
    knowledgeIndexCache.delete(version);
    throw error;
  });
  knowledgeIndexCache.set(version, pending);

  const oldestVersion = knowledgeIndexCache.keys().next().value;
  if (
    knowledgeIndexCache.size > MAX_CACHED_KNOWLEDGE_VERSIONS &&
    typeof oldestVersion === "string"
  ) {
    knowledgeIndexCache.delete(oldestVersion);
  }
  return pending;
}

async function loadKnowledgeIndex(
  definition: PublishedTool,
): Promise<ChatKnowledgeIndex> {
  const dataUrl = definition.dataUrl;
  if (!dataUrl) throw new Error("tool_data_unavailable");
  return await rememberKnowledgeIndex(definition.dataStorageId, async () => {
    const response = await fetch(dataUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("tool_data_unavailable");
    return buildChatKnowledgeIndex(
      parseChatKnowledgeGraph(await response.json()),
    );
  });
}

async function knowledgeGraphTool(definition: PublishedTool) {
  return tool({
    description:
      `${definition.description} Use it before answering questions about the ` +
      "company, product, repository, data, current work, or AI agency. " +
      "Only state facts supported by the returned evidence and say when a gap remains.",
    inputSchema: querySchema,
    execute: async ({ question }) => {
      if (!definition.dataUrl) return { error: "tool_data_unavailable" };
      try {
        return searchChatKnowledge(
          await loadKnowledgeIndex(definition),
          question,
        );
      } catch {
        return { error: "tool_data_unavailable" };
      }
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

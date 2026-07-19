/**
 * @fileType config
 * @domain kody
 * @pattern chat-entry-list
 * @ai-summary Builds the selectable chat backend/model entry list shared by
 *   the chat picker and default-chat settings.
 */

import { AGENTS, type AgentConfig, type AgentId } from "@dashboard/lib/agents";
import {
  resolveReasoning,
  type ModelReasoning,
} from "../core/reasoning-adapter";

/** A single selectable row in the chat agent picker. */
export interface ChatDropdownEntry {
  key: string;
  agentId: AgentId;
  modelId: string | null;
  name: string;
  description: string;
  icon: AgentConfig["icon"];
  /**
   * Effective thinking config for this entry. `null` when the model has
   * no `reasoning` block AND the model-name auto-detect couldn't pick
   * one — the chat header hides the `🧠` dropdown in that case.
   * Surfaced here so the UI never reaches into the raw `ChatModel` list.
   */
  reasoning: ModelReasoning | null;
  /** Runtime command selected for a personal Brain model. */
  runtime?: string;
}

/** A user-managed chat model from /api/kody/models (LLM_MODELS variable). */
export interface ChatModelEntry {
  id: string;
  label: string;
  enabled?: boolean;
  speech?: boolean;
  default?: boolean;
}

/** A personal Brain model configured on the /brain page. */
export interface BrainChatModelEntry {
  id: string;
  name: string;
  runtime?: string;
  enabled?: boolean;
  default?: boolean;
}

/** True when an entry key depends on the async /api/kody/models list. */
export function isModelBackedEntryKey(
  key: string | null | undefined,
): key is `kody:${string}` | `brain:${string}` {
  return (
    typeof key === "string" &&
    (key.startsWith("kody:") || key.startsWith("brain:"))
  );
}

/**
 * A saved gateway-model pick cannot be resolved until the async models list
 * finishes loading. Static agent picks can resolve from the built-in entries.
 */
export function shouldWaitForModelBackedEntryResolution({
  sessionHydrated,
  chatModelsLoaded,
  sessionAgentKey,
}: {
  sessionHydrated: boolean;
  chatModelsLoaded: boolean;
  sessionAgentKey: string | null | undefined;
}): boolean {
  if (!sessionHydrated) return true;
  if (chatModelsLoaded) return false;
  return !sessionAgentKey || isModelBackedEntryKey(sessionAgentKey);
}

/**
 * Build the ordered list of selectable chat entries.
 *
 * Live is always visible because it is the chat's fallback. Brain is visible
 * when configured; Repo Brain replaces it when its Fly chat toggle is on.
 */
export function buildAgentList(
  brainConfigured: boolean,
  flyConfigured: boolean,
  brainFlyChatEnabled: boolean,
  models: ChatModelEntry[],
  brainModels: BrainChatModelEntry[] = [],
): ChatDropdownEntry[] {
  const entries: ChatDropdownEntry[] = [];
  const live = AGENTS[flyConfigured ? "kody-live-fly" : "kody-live"];
  entries.push({
    key: live.id,
    agentId: live.id,
    modelId: null,
    name: live.name,
    description: live.description,
    icon: live.icon,
    reasoning: null,
  });

  const brain =
    flyConfigured && brainFlyChatEnabled
      ? AGENTS["brain-fly"]
      : brainConfigured || brainModels.length > 0
        ? AGENTS.brain
        : null;
  if (brain) {
    const configuredBrainModels = brainModels.filter(
      (model) => model.enabled !== false,
    );
    if (configuredBrainModels.length > 0) {
      entries.push(
        ...configuredBrainModels.map((model) => ({
          key: `${brain.id}:${model.id}`,
          agentId: brain.id,
          modelId: model.id,
          name: model.name,
          description: brain.description,
          icon: brain.icon,
          reasoning: null,
          runtime: model.runtime,
        })),
      );
    } else {
      entries.push({
        key: brain.id,
        agentId: brain.id,
        modelId: null,
        name: brain.name,
        description: brain.description,
        icon: brain.icon,
        reasoning: null,
      });
    }
  }

  // One row per enabled user-managed model. All route through the in-process
  // gateway path (`/api/kody/chat/kody`) with the model id forwarded in the
  // request body.
  const kody = AGENTS.kody;
  for (const m of models) {
    if (m.enabled === false) continue;
    entries.push({
      key: `kody:${m.id}`,
      agentId: "kody",
      modelId: m.id,
      name: m.label,
      description: m.id,
      icon: kody.icon,
      reasoning: resolveReasoning(m),
    });
  }
  return entries;
}

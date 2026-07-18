/**
 * @fileType config
 * @domain kody
 * @pattern chat-entry-list
 * @ai-summary Builds the user-facing list of configured custom chat models.
 *   Internal Brain and Live runners are not model-picker choices.
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
}

/** A user-managed chat model from /api/kody/models (LLM_MODELS variable). */
export interface ChatModelEntry {
  id: string;
  label: string;
  enabled?: boolean;
  speech?: boolean;
  default?: boolean;
}

/** True when an entry key depends on the async /api/kody/models list. */
export function isModelBackedEntryKey(
  key: string | null | undefined,
): key is `kody:${string}` {
  return typeof key === "string" && key.startsWith("kody:");
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
 * Brain and Live configuration is accepted for compatibility with existing
 * callers, but neither internal runner is exposed as a model choice.
 */
export function buildAgentList(
  _brainConfigured: boolean,
  _flyConfigured: boolean,
  _brainFlyChatEnabled: boolean,
  models: ChatModelEntry[],
): ChatDropdownEntry[] {
  const entries: ChatDropdownEntry[] = [];
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

/**
 * @fileType utility
 * @domain chat
 * @pattern model-catalog
 * @ai-summary Composes the single Kody Chat model catalog from persisted
 *   models plus the built-in OpenRouter Free fallback.
 */

import {
  composeChatModelCatalog,
  KODY_OPENROUTER_FREE_CHAT_MODEL,
} from "kody-chat-model-catalog";

export { composeChatModelCatalog, KODY_OPENROUTER_FREE_CHAT_MODEL };
export type { CatalogModel } from "kody-chat-model-catalog";

/**
 * Dashboard compatibility boundary for package-owned model resolution.
 *
 * Keep all provider routing in the mounted chat package so direct chat,
 * compact, title, and analysis routes cannot drift.
 */
export {
  resolveChatModel,
  type ResolvedChatModel,
  type ResolveChatModelOptions,
} from "@kody-ade/kody-chat-dashboard/chat/resolve-model";

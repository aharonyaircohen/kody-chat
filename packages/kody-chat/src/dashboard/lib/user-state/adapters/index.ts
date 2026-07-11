/**
 * @fileType utility
 * @domain user-state
 * @pattern user-state-adapter-registry
 * @ai-summary Registry of user-state adapters by name. Phase 1 ships only
 *   "state-repo"; later backends (e.g. a CMS bridge to MongoDB) register
 *   here with zero contract change.
 */
import "server-only";
import { UserStateError, type UserStateAdapter } from "../types";
import { stateRepoUserStateAdapter } from "./state-repo";

const adapters = new Map<string, UserStateAdapter>([
  [stateRepoUserStateAdapter.name, stateRepoUserStateAdapter],
]);

export function getUserStateAdapter(name: string): UserStateAdapter {
  const adapter = adapters.get(name);
  if (!adapter) {
    throw new UserStateError(
      "adapter_not_found",
      `Unknown user-state adapter "${name}"`,
    );
  }
  return adapter;
}

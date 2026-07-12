/**
 * @fileType utility
 * @domain user-state
 * @pattern user-state-adapter-registry
 * @ai-summary Registry of user-state adapters by name. "state-repo" stores
 *   per-user JSON in the kody-state repo; "cms:<collection>" bridges into
 *   the brand's CMS backend (e.g. MongoDB) with ownership scoping.
 */
import "server-only";
import { UserStateError, type UserStateAdapter } from "../types";
import {
  cmsBridgeUserStateAdapter,
  parseCmsBridgeCollection,
} from "./cms-bridge";
import { stateRepoUserStateAdapter } from "./state-repo";

const adapters = new Map<string, UserStateAdapter>([
  [stateRepoUserStateAdapter.name, stateRepoUserStateAdapter],
]);

export function getUserStateAdapter(name: string): UserStateAdapter {
  // `cms:<collection>` routes into the brand's CMS backend.
  if (parseCmsBridgeCollection(name)) return cmsBridgeUserStateAdapter;
  const adapter = adapters.get(name);
  if (!adapter) {
    throw new UserStateError(
      "adapter_not_found",
      `Unknown user-state adapter "${name}"`,
    );
  }
  return adapter;
}

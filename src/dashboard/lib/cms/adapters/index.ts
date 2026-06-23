import { mongoCmsAdapter } from "./mongodb";
import { mongoCmsSetupAdapter } from "./mongodb-setup";
import type { CmsAdapter, CmsSetupAdapter } from "./types";

const ADAPTERS = new Map<string, CmsAdapter>([
  [mongoCmsAdapter.name, mongoCmsAdapter],
]);

const SETUP_ADAPTERS = new Map<string, CmsSetupAdapter>([
  [mongoCmsSetupAdapter.name, mongoCmsSetupAdapter],
]);

export function getCmsAdapter(name: string): CmsAdapter | null {
  return ADAPTERS.get(name) ?? null;
}

export function getCmsSetupAdapter(name?: string): CmsSetupAdapter | null {
  if (name) return SETUP_ADAPTERS.get(name) ?? null;
  return SETUP_ADAPTERS.values().next().value ?? null;
}

export type {
  CmsAdapter,
  CmsAdapterContext,
  CmsSetupAdapter,
  CmsSetupFile,
  CmsSetupResult,
} from "./types";
export { CmsAdapterError, CmsAdapterSetupError } from "./types";

import type { NextRequest } from "next/server";

import {
  providerConfigFromContext,
  resolveProviderContext,
  type ProviderContext,
  type ProviderRuntimeConfig,
} from "./server-operations";

export type ServerProviderContext = ProviderContext;
export type ServerProviderConfig = ProviderRuntimeConfig;

export function resolveServerProviderContext(
  req: NextRequest,
  options?: { repoOverride?: { owner: string; repo: string } },
) {
  return resolveProviderContext(req, options);
}

export function serverProviderConfigFromContext(
  context: ServerProviderContext,
): ServerProviderConfig | null {
  return providerConfigFromContext(context);
}

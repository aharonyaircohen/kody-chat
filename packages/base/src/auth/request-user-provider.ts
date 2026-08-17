import type { NextRequest } from "next/server";

export type KodyRequestUser = Readonly<{ id: string; label: string }>;

export interface KodyRequestUserProvider {
  resolveUser(req: NextRequest): Promise<KodyRequestUser | null>;
}

const PROVIDER_KEY = Symbol.for("kody.request-user-provider");
type ProviderGlobal = typeof globalThis & {
  [PROVIDER_KEY]?: KodyRequestUserProvider;
};

export function setKodyRequestUserProvider(
  provider: KodyRequestUserProvider | null,
): void {
  const registry = globalThis as ProviderGlobal;
  if (provider) registry[PROVIDER_KEY] = provider;
  else delete registry[PROVIDER_KEY];
}

export function getKodyRequestUserProvider(): KodyRequestUserProvider | null {
  return (globalThis as ProviderGlobal)[PROVIDER_KEY] ?? null;
}

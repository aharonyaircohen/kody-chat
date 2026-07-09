/**
 * @fileType utility
 * @domain client-auth
 * @pattern provider-credentials
 * @ai-summary Resolve OAuth client credentials per provider for the
 *   client-surface sign-in. Each provider's client ID is public config and
 *   lives in /variables; its secret lives in the /secrets vault. Both fall
 *   through to process.env — the same vault→env contract as `getSecret`.
 */
import type { ClientAuthProvider } from "./allowlist";
import {
  PROVIDER_CATALOG,
  credentialNames,
  isSupportedProviderId,
} from "./catalog";
import {
  resolvePublicStateVariable,
  resolveVaultGithubToken,
} from "../vault/bootstrap";
import { type ClientBrandRepoContext } from "../client-brand-repo-cookie";

export interface ProviderCredentials {
  clientId: string;
  clientSecret: string;
  /** Extra provider options (issuer, tenant …) from the catalog spec. */
  extra?: Record<string, string>;
}

async function resolveOne(
  name: string,
  context: ClientBrandRepoContext | null,
  read: (owner: string, repo: string, name: string) => Promise<string | null>,
): Promise<string | null> {
  if (context) {
    const fromState = await read(context.owner, context.repo, name);
    if (fromState) return fromState;
  }
  return process.env[name] ?? null;
}

export async function resolveProviderCredentials(
  provider: ClientAuthProvider,
  context: ClientBrandRepoContext | null,
): Promise<ProviderCredentials | null> {
  if (!isSupportedProviderId(provider)) return null;
  const names = credentialNames(provider);
  const [clientId, clientSecret] = await Promise.all([
    resolveOne(names.id, context, resolvePublicStateVariable),
    resolveOne(names.secret, context, (owner, repo, name) =>
      resolveVaultGithubToken(owner, repo, name),
    ),
  ]);
  if (!clientId || !clientSecret) return null;

  // Extra options (issuer/tenant …) are non-secret → /variables. All of a
  // provider's declared extras must resolve or it counts as unconfigured.
  const extraSpec = PROVIDER_CATALOG[provider]?.extra;
  let extra: Record<string, string> | undefined;
  if (extraSpec) {
    extra = {};
    for (const [option, variable] of Object.entries(extraSpec)) {
      const value = await resolveOne(
        variable,
        context,
        resolvePublicStateVariable,
      );
      if (!value) return null;
      extra[option] = value;
    }
  }
  return { clientId, clientSecret, ...(extra ? { extra } : {}) };
}

/** Providers from `wanted` that actually have credentials configured. */
export async function resolveConfiguredProviders(
  wanted: ClientAuthProvider[],
  context: ClientBrandRepoContext | null,
): Promise<ClientAuthProvider[]> {
  const checks = await Promise.all(
    wanted.map(async (provider) => ({
      provider,
      ok: (await resolveProviderCredentials(provider, context)) !== null,
    })),
  );
  return checks.filter((c) => c.ok).map((c) => c.provider);
}

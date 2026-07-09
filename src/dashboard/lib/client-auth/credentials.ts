/**
 * @fileType utility
 * @domain client-auth
 * @pattern provider-credentials
 * @ai-summary Resolve Google OAuth client credentials for the client-surface
 *   sign-in. Vault-first (the connected repo named by the public brand-repo
 *   cookie, via the unauthenticated bootstrap reader), then process.env —
 *   the same vault→env fallthrough contract as `getSecret`.
 */
import { resolveVaultGithubToken } from "../vault/bootstrap";
import {
  type ClientBrandRepoContext,
} from "../client-brand-repo-cookie";

export interface GoogleClientCredentials {
  clientId: string;
  clientSecret: string;
}

async function resolveOne(
  name: string,
  context: ClientBrandRepoContext | null,
): Promise<string | null> {
  if (context) {
    const fromVault = await resolveVaultGithubToken(
      context.owner,
      context.repo,
      name,
    );
    if (fromVault) return fromVault;
  }
  return process.env[name] ?? null;
}

export async function resolveGoogleCredentials(
  context: ClientBrandRepoContext | null,
): Promise<GoogleClientCredentials | null> {
  const [clientId, clientSecret] = await Promise.all([
    resolveOne("GOOGLE_CLIENT_ID", context),
    resolveOne("GOOGLE_CLIENT_SECRET", context),
  ]);
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

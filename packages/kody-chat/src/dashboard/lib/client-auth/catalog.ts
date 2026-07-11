/**
 * @fileType data
 * @domain client-auth
 * @pattern provider-catalog
 * @ai-summary Small catalog over Auth.js's provider modules. Any module id
 *   under `next-auth/providers/` is loadable; credential names derive
 *   mechanically from the id (slack → SLACK_CLIENT_ID / SLACK_CLIENT_SECRET,
 *   ids in /variables, secrets in the vault). This file only holds display
 *   labels for the picker and the few providers that need extra options
 *   (issuer/tenant), each read from /variables by the named variable.
 */

export interface ProviderSpec {
  label: string;
  /** Extra provider options: option key → /variables name holding it. */
  extra?: Record<string, string>;
}

export const PROVIDER_CATALOG: Record<string, ProviderSpec> = {
  google: { label: "Google" },
  github: { label: "GitHub" },
  "microsoft-entra-id": {
    label: "Microsoft",
    extra: { issuer: "MICROSOFT_ENTRA_ID_ISSUER" },
  },
  apple: { label: "Apple" },
  facebook: { label: "Facebook" },
  slack: { label: "Slack" },
  discord: { label: "Discord" },
  linkedin: { label: "LinkedIn" },
  gitlab: { label: "GitLab" },
  auth0: { label: "Auth0", extra: { issuer: "AUTH0_ISSUER" } },
  okta: { label: "Okta", extra: { issuer: "OKTA_ISSUER" } },
  keycloak: { label: "Keycloak", extra: { issuer: "KEYCLOAK_ISSUER" } },
};

/** Module ids must be plain slugs — also guards the dynamic import path. */
export const PROVIDER_ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

/** Non-OAuth modules that the generic loader must not offer. */
const UNSUPPORTED = new Set([
  "credentials",
  "email",
  "nodemailer",
  "passkey",
  "webauthn",
  "oauth-types",
  "index",
]);

export function isSupportedProviderId(id: string): boolean {
  return PROVIDER_ID_RE.test(id) && !UNSUPPORTED.has(id);
}

export function providerLabel(id: string): string {
  const known = PROVIDER_CATALOG[id]?.label;
  if (known) return known;
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** GOOGLE_CLIENT_ID-style names derived from the provider id. */
export function credentialNames(id: string): { id: string; secret: string } {
  const base = id.toUpperCase().replace(/-/g, "_");
  return { id: `${base}_CLIENT_ID`, secret: `${base}_CLIENT_SECRET` };
}

/**
 * @fileType utility
 * @domain client-auth
 * @pattern brand-access-policy
 * @ai-summary Pure access-policy helpers for brand-scoped client auth. A
 *   brand's optional `auth` block declares whether sign-in is required and
 *   which Google-verified emails/domains may enter. Pure functions — unit
 *   tested without any GitHub or Auth.js dependency.
 */

export const CLIENT_AUTH_PROVIDERS = ["google", "github"] as const;
export type ClientAuthProvider = (typeof CLIENT_AUTH_PROVIDERS)[number];

export interface ClientBrandAuth {
  /** When true, `/client/<slug>` requires a signed-in, allowed user. */
  required: boolean;
  /** Sign-in methods offered to visitors (default: ["google"]). */
  providers?: ClientAuthProvider[];
  /** Exact emails allowed (case-insensitive). */
  allowedEmails?: string[];
  /** Email domains allowed, without "@" (case-insensitive), e.g. "acme.com". */
  allowedDomains?: string[];
}

export function normalizeClientBrandAuth(
  input: unknown,
): ClientBrandAuth | undefined {
  if (!input || typeof input !== "object") return undefined;
  const raw = input as Record<string, unknown>;
  const emails = normalizeList(raw.allowedEmails).filter((e) =>
    e.includes("@"),
  );
  const domains = normalizeList(raw.allowedDomains).map((d) =>
    d.replace(/^@/, ""),
  );
  const providers = normalizeList(raw.providers).filter(
    (p): p is ClientAuthProvider =>
      (CLIENT_AUTH_PROVIDERS as readonly string[]).includes(p),
  );
  return {
    required: raw.required === true,
    ...(providers.length ? { providers } : {}),
    ...(emails.length ? { allowedEmails: emails } : {}),
    ...(domains.length ? { allowedDomains: domains } : {}),
  };
}

/** Providers a brand offers, defaulting to Google. */
export function brandAuthProviders(
  auth: ClientBrandAuth,
): ClientAuthProvider[] {
  return auth.providers?.length ? auth.providers : ["google"];
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Decide whether `email` may enter a brand. With no allowlists configured,
 * any signed-in Google account is allowed (auth = identity only).
 */
export function isEmailAllowed(
  auth: ClientBrandAuth,
  email: string | null | undefined,
): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return false;
  const emails = auth.allowedEmails ?? [];
  const domains = auth.allowedDomains ?? [];
  if (!emails.length && !domains.length) return true;
  if (emails.includes(normalized)) return true;
  const domain = normalized.split("@").pop() ?? "";
  return domains.includes(domain);
}

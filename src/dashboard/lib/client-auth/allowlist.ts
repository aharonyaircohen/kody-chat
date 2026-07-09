/**
 * @fileType utility
 * @domain client-auth
 * @pattern brand-access-policy
 * @ai-summary Pure access-policy helpers for brand-scoped client auth. A
 *   brand's optional `auth` block declares whether sign-in is required and
 *   which Google-verified emails/domains may enter. Pure functions — unit
 *   tested without any GitHub or Auth.js dependency.
 */

export interface ClientBrandAuth {
  /** When true, `/client/<slug>` requires a signed-in, allowed user. */
  required: boolean;
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
  return {
    required: raw.required === true,
    ...(emails.length ? { allowedEmails: emails } : {}),
    ...(domains.length ? { allowedDomains: domains } : {}),
  };
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

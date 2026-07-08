/**
 * @fileType data
 * @domain client-chat
 * @pattern client-brand-config
 * @ai-summary Small, route-owned brand config for the client chat surface.
 *   This is display data only; chat behavior stays in KodyChat.
 */

export interface ClientBrand {
  slug: string;
  name: string;
  accent: string;
}

const KNOWN_CLIENT_BRANDS: Record<string, ClientBrand> = {
  kody: {
    slug: "kody",
    name: "Kody",
    accent: "#0f766e",
  },
};

export function normalizeClientBrandSlug(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized || "kody";
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getClientBrand(slug: string): ClientBrand {
  const normalized = normalizeClientBrandSlug(slug);
  return (
    KNOWN_CLIENT_BRANDS[normalized] ?? {
      slug: normalized,
      name: titleFromSlug(normalized),
      accent: "#0f766e",
    }
  );
}

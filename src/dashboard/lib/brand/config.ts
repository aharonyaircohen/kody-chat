export interface BrandTheme {
  primary: string;
  accent: string;
  background: string;
  foreground: string;
}

export interface BrandConfig {
  slug: string;
  displayName: string;
  tagline: string;
  allowedAgent: "kody";
  allowedTools: string[];
  theme: BrandTheme;
}

const RESERVED_BRAND_SLUGS = new Set([
  "activity",
  "admin",
  "agents",
  "api",
  "bug",
  "changelog",
  "chat",
  "docs",
  "files",
  "kody",
  "new",
  "org",
  "repo",
  "report-kody-bug",
  "settings",
  "state-files",
  "store-catalog",
  "tasks",
  "vibe",
]);

const BRANDS: BrandConfig[] = [
  {
    slug: "demo-brand",
    displayName: "Demo Brand",
    tagline: "Customer support powered by Kody",
    allowedAgent: "kody",
    allowedTools: [],
    theme: {
      primary: "173 80% 24%",
      accent: "38 92% 50%",
      background: "210 40% 98%",
      foreground: "222 47% 11%",
    },
  },
];

export function normalizeBrandSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

export function isValidBrandSlug(slug: string): boolean {
  const normalized = normalizeBrandSlug(slug);
  return /^[a-z][a-z0-9-]{1,62}$/.test(normalized);
}

export function isReservedBrandSlug(slug: string): boolean {
  return RESERVED_BRAND_SLUGS.has(normalizeBrandSlug(slug));
}

export function listBrandConfigs(): BrandConfig[] {
  return [...BRANDS];
}

export function getBrandBySlug(slug: string): BrandConfig | null {
  const normalized = normalizeBrandSlug(slug);
  if (!isValidBrandSlug(normalized) || isReservedBrandSlug(normalized)) {
    return null;
  }
  return BRANDS.find((brand) => brand.slug === normalized) ?? null;
}

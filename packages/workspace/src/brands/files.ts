/**
 * @fileType util
 * @domain client-chat
 * @pattern brands-files
 * @ai-summary Read/write operator-managed client brands in the Convex backend
 *   (repoDocs, kind `brand:<slug>`, doc = the validated ClientBrand JSON;
 *   disabled markers are kind `brand-disabled:<slug>`). These records feed
 *   `/client/<slug>`, the branding chat plugin, and client-surface chat
 *   defaults enforced by the chat route. Returned `sha` is always ""
 *   (Convex docs have no git blob). One `listByPrefix` query replaces the old
 *   per-brand GitHub reads — the backend remains export-only.
 */

import { z } from "zod";
import {
  backendApi,
  getConvexClient,
  tenantIdFor,
} from "@kody-ade/base/backend/convex";
import { getOwner, getRepo } from "../github";
import {
  normalizeClientBrandLocale,
  normalizeClientBrandSlug,
  type ClientBrand,
} from "@kody-ade/base/client-brand";
import { normalizeClientBrandAuth } from "@kody-ade/base/client-auth/allowlist";
import { slugifyTitle } from "@kody-ade/base/slug";

export interface BrandFile extends ClientBrand {
  source: "repo";
  sha: string;
  updatedAt: string;
  htmlUrl: string;
}

const BRAND_KIND_PREFIX = "brand:";
const DISABLED_KIND_PREFIX = "brand-disabled:";
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/;

const brandFileSchema = z.object({
  slug: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  accent: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/),
  locale: z.string().trim().max(35).optional(),
  welcomeText: z.string().trim().max(1000).optional(),
  modelId: z.string().trim().min(1).max(160).optional(),
  agentSlug: z.string().trim().min(1).max(80).optional(),
  auth: z
    .object({
      required: z.boolean().optional(),
      providers: z.array(z.string().trim().max(40)).max(10).optional(),
      allowedEmails: z.array(z.string().trim().max(320)).max(500).optional(),
      allowedDomains: z.array(z.string().trim().max(255)).max(100).optional(),
    })
    .optional(),
});

type BrandFileInput = z.infer<typeof brandFileSchema>;

interface BrandDocRecord {
  kind: string;
  doc: unknown;
  updatedAt: string;
}

function tenantId(): string {
  return tenantIdFor(getOwner(), getRepo());
}

function brandKind(slug: string): string {
  return `${BRAND_KIND_PREFIX}${slug}`;
}

function disabledKind(slug: string): string {
  return `${DISABLED_KIND_PREFIX}${slug}`;
}

export function isValidBrandSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(slug);
}

function normalizeAccent(input: string): string {
  return input.trim().toLowerCase();
}

function normalizeAgentSlug(input: string): string {
  return slugifyTitle(input);
}

function parseBrandDoc(doc: unknown, fallbackSlug: string): ClientBrand {
  const result = brandFileSchema.safeParse(doc);
  if (!result.success) {
    throw new Error(
      `Invalid brand record "${fallbackSlug}": ${result.error.issues[0]?.message ?? "validation failed"}`,
    );
  }
  return normalizeBrandInput(result.data, fallbackSlug);
}

function normalizeBrandInput(input: BrandFileInput, fallbackSlug?: string) {
  const slug = normalizeClientBrandSlug(input.slug || fallbackSlug || "");
  const accent = normalizeAccent(input.accent);
  if (!isValidBrandSlug(slug)) {
    throw new Error(
      "Brand slug must use lowercase letters, digits, or dashes and start with a letter or digit.",
    );
  }
  if (!HEX_COLOR_RE.test(accent)) {
    throw new Error("Brand accent must be a 6-digit hex color.");
  }

  return {
    slug,
    name: input.name.trim(),
    accent,
    locale: normalizeClientBrandLocale(input.locale),
    ...(input.welcomeText?.trim()
      ? { welcomeText: input.welcomeText.trim() }
      : {}),
    ...(input.modelId?.trim() ? { modelId: input.modelId.trim() } : {}),
    ...(input.agentSlug?.trim()
      ? { agentSlug: normalizeAgentSlug(input.agentSlug) }
      : {}),
    ...(() => {
      const auth = normalizeClientBrandAuth(input.auth);
      return auth ? { auth } : {};
    })(),
  } satisfies ClientBrand;
}

function recordToBrandFile(record: BrandDocRecord): BrandFile | null {
  const slug = normalizeClientBrandSlug(
    record.kind.slice(BRAND_KIND_PREFIX.length),
  );
  if (!isValidBrandSlug(slug)) return null;
  try {
    return {
      ...parseBrandDoc(record.doc, slug),
      source: "repo" as const,
      sha: "",
      updatedAt: record.updatedAt ?? "",
      htmlUrl: "",
    };
  } catch {
    return null;
  }
}

export async function listDeletedBrandSlugs(): Promise<Set<string>> {
  const records = (await getConvexClient().query(
    backendApi.repoDocs.listByPrefix,
    { tenantId: tenantId(), prefix: DISABLED_KIND_PREFIX },
  )) as BrandDocRecord[];
  const slugs = records
    .map((record) =>
      normalizeClientBrandSlug(record.kind.slice(DISABLED_KIND_PREFIX.length)),
    )
    .filter((slug) => isValidBrandSlug(slug));
  return new Set(slugs);
}

export async function isBrandDeleted(slug: string): Promise<boolean> {
  const normalized = normalizeClientBrandSlug(slug);
  if (!isValidBrandSlug(normalized)) return false;
  const record = (await getConvexClient().query(backendApi.repoDocs.get, {
    tenantId: tenantId(),
    kind: disabledKind(normalized),
  })) as BrandDocRecord | null;
  return record !== null;
}

/** One indexed Convex query for all brands (was N GitHub reads). */
export async function listBrandFiles(): Promise<BrandFile[]> {
  const [records, deletedSlugs] = await Promise.all([
    getConvexClient().query(backendApi.repoDocs.listByPrefix, {
      tenantId: tenantId(),
      prefix: BRAND_KIND_PREFIX,
    }) as Promise<BrandDocRecord[]>,
    listDeletedBrandSlugs(),
  ]);
  return records
    .map(recordToBrandFile)
    .filter((file): file is BrandFile => file !== null)
    .filter((file) => !deletedSlugs.has(file.slug))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function readBrandFile(slug: string): Promise<BrandFile | null> {
  const normalized = normalizeClientBrandSlug(slug);
  if (!isValidBrandSlug(normalized)) return null;
  const record = (await getConvexClient().query(backendApi.repoDocs.get, {
    tenantId: tenantId(),
    kind: brandKind(normalized),
  })) as BrandDocRecord | null;
  if (!record) return null;
  return recordToBrandFile(record);
}

export async function findBrandFileFromList(
  slug: string,
): Promise<BrandFile | null> {
  const normalized = normalizeClientBrandSlug(slug);
  if (!isValidBrandSlug(normalized)) return null;
  const brands = await listBrandFiles();
  return brands.find((brand) => brand.slug === normalized) ?? null;
}

export interface WriteBrandOptions {
  slug: string;
  name: string;
  accent: string;
  locale?: string;
  welcomeText?: string;
  modelId?: string;
  agentSlug?: string;
  auth?: {
    required?: boolean;
    providers?: string[];
    allowedEmails?: string[];
    allowedDomains?: string[];
  };
}

export async function writeBrandFile(
  opts: WriteBrandOptions,
): Promise<BrandFile> {
  const brand = normalizeBrandInput({
    slug: opts.slug,
    name: opts.name,
    accent: opts.accent,
    locale: opts.locale,
    welcomeText: opts.welcomeText,
    modelId: opts.modelId,
    agentSlug: opts.agentSlug,
    auth: opts.auth,
  });
  const updatedAt = new Date().toISOString();
  const client = getConvexClient();
  await client.mutation(backendApi.repoDocs.save, {
    tenantId: tenantId(),
    kind: brandKind(brand.slug),
    doc: brand,
    updatedAt,
  });
  // Writing a brand re-enables it.
  await client.mutation(backendApi.repoDocs.remove, {
    tenantId: tenantId(),
    kind: disabledKind(brand.slug),
  });
  return {
    ...brand,
    source: "repo" as const,
    sha: "",
    updatedAt,
    htmlUrl: "",
  };
}

export async function deleteBrandFile(slug: string): Promise<void> {
  const normalized = normalizeClientBrandSlug(slug);
  if (!isValidBrandSlug(normalized)) return;
  await getConvexClient().mutation(backendApi.repoDocs.remove, {
    tenantId: tenantId(),
    kind: brandKind(normalized),
  });
}

export async function disableBrand(slug: string): Promise<void> {
  const normalized = normalizeClientBrandSlug(slug);
  if (!isValidBrandSlug(normalized)) return;
  await getConvexClient().mutation(backendApi.repoDocs.save, {
    tenantId: tenantId(),
    kind: disabledKind(normalized),
    doc: { slug: normalized },
    updatedAt: new Date().toISOString(),
  });
}

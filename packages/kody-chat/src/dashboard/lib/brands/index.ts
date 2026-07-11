/**
 * @fileType module
 * @domain client-chat
 * @pattern brands-index
 * @ai-summary Public surface for operator-managed client brands. Repo state
 *   files override dashboard fallback brands; fallback brands keep existing
 *   `/client/<slug>` behavior stable for empty repos.
 */

import {
  BUILTIN_CLIENT_BRANDS,
  getBuiltinClientBrand,
  type ClientBrand,
} from "../client-brand";
import {
  findBrandFileFromList,
  isBrandDeleted,
  listDeletedBrandSlugs,
  listBrandFiles,
  type BrandFile,
} from "./files";

export type { BrandFile } from "./files";
export {
  disableBrand,
  deleteBrandFile,
  findBrandFileFromList,
  isBrandDeleted,
  isValidBrandSlug,
  listDeletedBrandSlugs,
  listBrandFiles,
  readBrandFile,
  writeBrandFile,
} from "./files";

export type BrandSource = "repo" | "builtin";

export type ResolvedBrand = ClientBrand & {
  source: BrandSource;
  sha: string;
  updatedAt: string;
  htmlUrl: string;
};

function builtInAsResolved(brand: ClientBrand): ResolvedBrand {
  return {
    ...brand,
    source: "builtin",
    sha: "",
    updatedAt: "",
    htmlUrl: "",
  };
}

export async function listBrands(): Promise<ResolvedBrand[]> {
  const [repoBrands, deletedSlugs] = await Promise.all([
    listBrandFiles(),
    listDeletedBrandSlugs(),
  ]);
  const repoSlugs = new Set(repoBrands.map((brand) => brand.slug));
  const builtins = BUILTIN_CLIENT_BRANDS.filter(
    (brand) => !repoSlugs.has(brand.slug) && !deletedSlugs.has(brand.slug),
  ).map(builtInAsResolved);
  return [...repoBrands, ...builtins].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  );
}

export async function readResolvedBrand(
  slug: string,
): Promise<BrandFile | ResolvedBrand | null> {
  if (await isBrandDeleted(slug)) return null;
  const repoBrand = await findBrandFileFromList(slug);
  if (repoBrand) return repoBrand;
  const fallback = getBuiltinClientBrand(slug);
  return fallback ? builtInAsResolved(fallback) : null;
}

export function isRepoBrand(
  brand: ResolvedBrand | BrandFile,
): brand is BrandFile {
  return brand.source === "repo";
}

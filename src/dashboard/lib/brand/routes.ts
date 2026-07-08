import type { BrandConfig } from "./config";
import { getBrandBySlug, isReservedBrandSlug, normalizeBrandSlug } from "./config";

export type RootSegmentClassification =
  | { kind: "task"; issueNumber: number }
  | { kind: "brand"; brand: BrandConfig }
  | { kind: "reserved"; slug: string }
  | { kind: "unknown"; slug: string };

export function classifyRootSegment(segment: string): RootSegmentClassification {
  const slug = normalizeBrandSlug(segment);
  if (/^\d+$/.test(slug)) {
    return { kind: "task", issueNumber: Number(slug) };
  }
  if (isReservedBrandSlug(slug)) {
    return { kind: "reserved", slug };
  }
  const brand = getBrandBySlug(slug);
  if (brand) return { kind: "brand", brand };
  return { kind: "unknown", slug };
}

/**
 * @fileType page
 * @domain client-chat
 * @pattern brand-selected-page
 * @ai-summary Selected Brand route. Keeps brand selection addressable at
 *   `/brands/<slug>`.
 */
import { BrandsManager } from "@kody-ade/kody-chat/components/BrandsManager";
import { buildKodyMetadata } from "../../../metadata";

export const dynamic = "force-dynamic";

export const metadata = buildKodyMetadata({
  title: "Brand - Kody Operations Dashboard",
  description: "View a selected client chat brand.",
  path: "/brands",
});

export default async function SelectedBrandPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <BrandsManager selectedSlug={slug} />;
}

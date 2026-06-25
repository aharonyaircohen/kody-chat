/**
 * @fileType page
 * @domain kody
 * @pattern company-intent-selected-page
 * @ai-summary Selected Company Intent route. Keeps intent selection
 * addressable at `/company-intents/<id>`.
 */
import { CompanyIntentsView } from "@dashboard/lib/components/CompanyIntentsView";
import { buildKodyMetadata } from "../../../metadata";

export const dynamic = "force-dynamic";

export const metadata = buildKodyMetadata({
  title: "Intent - Kody Operations Dashboard",
  description: "View a selected company-manager intent.",
  path: "/company-intents",
});

export default async function SelectedCompanyIntentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CompanyIntentsView selectedId={id} />;
}

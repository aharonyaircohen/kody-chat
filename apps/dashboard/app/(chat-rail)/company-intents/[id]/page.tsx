/**
 * @fileType page
 * @domain kody
 * @pattern company-intent-selected-page
 * @ai-summary Selected AI Agency Intent route. Keeps intent selection
 * addressable at `/company-intents/<id>`.
 */
import { AgencyDefinitionsView } from "@dashboard/features/admin/components/AgencyDefinitionsView";
import { buildKodyMetadata } from "../../../metadata";

export const dynamic = "force-dynamic";

export const metadata = buildKodyMetadata({
  title: "Intent - Kody Operations Dashboard",
  description: "View a selected AI Agency manager intent.",
  path: "/company-intents",
});

export default async function SelectedCompanyIntentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AgencyDefinitionsView kind="intent" selectedId={id} />;
}

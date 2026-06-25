/**
 * @fileType page
 * @domain kody
 * @pattern reports-selected-page
 * @ai-summary Selected report route. Keeps report selection addressable at
 * `/reports/<slug>`.
 */
import { ReportsView } from "@dashboard/lib/components/ReportsView";
import { buildKodyMetadata } from "../../../metadata";

export const dynamic = "force-dynamic";

export const metadata = buildKodyMetadata({
  title: "Report — Kody Operations Dashboard",
  description: "View a selected Kody report.",
  path: "/reports",
});

export default async function SelectedReportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ReportsView selectedSlug={slug} />;
}

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
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ run?: string | string[]; type?: string | string[] }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const selectedRunId = Array.isArray(query.run) ? query.run[0] : query.run;
  const type = Array.isArray(query.type) ? query.type[0] : query.type;
  return (
    <ReportsView
      selectedSlug={slug}
      selectedRunId={selectedRunId}
      reportType={type}
    />
  );
}

/**
 * @fileType page
 * @domain kody
 * @pattern reports-page
 * @ai-summary Reports has its own page (the Capabilities page no longer has tabs).
 *   Renders the standalone ReportsView.
 */
import { ReportsView } from "@dashboard/lib/components/ReportsView";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  const query = await searchParams;
  const type = Array.isArray(query.type) ? query.type[0] : query.type;
  return <ReportsView reportType={type} />;
}

/**
 * @fileType page
 * @domain kody
 * @pattern agent-loop-selected-page
 * @ai-summary Selected Loop route. Keeps loop selection addressable at
 * `/agent-loops/<id>`.
 */
import { AgencyDefinitionsView } from "@dashboard/features/admin/components/AgencyDefinitionsView";
import { buildKodyMetadata } from "../../../metadata";

export const dynamic = "force-dynamic";

export const metadata = buildKodyMetadata({
  title: "Loop - Kody Operations Dashboard",
  description: "View a selected Kody loop.",
  path: "/agent-loops",
});

export default async function SelectedAgentLoopPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AgencyDefinitionsView kind="loop" selectedId={id} />;
}

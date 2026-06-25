/**
 * @fileType page
 * @domain kody
 * @pattern agent-goal-selected-page
 * @ai-summary Selected Goal route. Keeps goal selection addressable at
 * `/agent-goals/<id>`.
 */
import { ManagedModelsView } from "@dashboard/lib/components/ManagedModelsView";
import { buildKodyMetadata } from "../../../metadata";

export const dynamic = "force-dynamic";

export const metadata = buildKodyMetadata({
  title: "Goal - Kody Operations Dashboard",
  description: "View a selected Kody goal.",
  path: "/agent-goals",
});

export default async function SelectedAgentGoalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ManagedModelsView model="agentGoal" selectedId={id} />;
}

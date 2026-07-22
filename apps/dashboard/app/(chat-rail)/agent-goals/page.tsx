/**
 * @fileType page
 * @domain kody
 * @pattern agentGoals
 * @ai-summary AgentGoal page for finite, evidence-driven operating models.
 */

import { AgencyDefinitionsView } from "@dashboard/features/admin/components/AgencyDefinitionsView";
import { buildKodyMetadata } from "../../metadata";

export const metadata = buildKodyMetadata({
  title: "Goals - Kody Operations Dashboard",
  description: "Finite Kody goals driven by missing evidence.",
  path: "/agent-goals",
});

export default function AgentGoalsPage() {
  return <AgencyDefinitionsView kind="goal" />;
}

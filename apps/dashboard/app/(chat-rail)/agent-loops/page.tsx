/**
 * @fileType page
 * @domain kody
 * @pattern agentLoops
 * @ai-summary AgentLoop page for ongoing schedule/health operating models.
 */

import { AgencyDefinitionsView } from "@dashboard/features/admin/components/AgencyDefinitionsView";
import { buildKodyMetadata } from "../../metadata";

export const metadata = buildKodyMetadata({
  title: "Loops - Kody Operations Dashboard",
  description: "Ongoing Kody loops driven by schedule and health state.",
  path: "/agent-loops",
});

export default function AgentLoopsPage() {
  return <AgencyDefinitionsView kind="loop" />;
}

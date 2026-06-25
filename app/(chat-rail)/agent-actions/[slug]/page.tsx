/**
 * @fileType page
 * @domain agentActions
 * @pattern agentActions-page
 * @ai-summary Selected agentAction route. Keeps item selection addressable at
 * `/agent-actions/<slug>` while reusing the shared manager.
 */
import { AuthGuard } from "@dashboard/lib/auth-guard";
import { AgentActionsManager } from "@dashboard/lib/components/AgentActionsManager";
import { buildKodyMetadata } from "../../../metadata";

export const dynamic = "force-dynamic";

export const metadata = buildKodyMetadata({
  title: "Action — Kody Operations Dashboard",
  description: "View a selected agentAction implementation.",
  path: "/agent-actions",
});

export default async function EditAgentActionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <AuthGuard>
      <AgentActionsManager selectedSlug={slug} />
    </AuthGuard>
  );
}

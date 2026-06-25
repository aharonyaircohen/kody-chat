/**
 * @fileType page
 * @domain kody
 * @pattern agent-responsibility-selected-page
 * @ai-summary Selected Responsibility route. Keeps responsibility selection
 * addressable at `/agent-responsibilities/<slug>`.
 */
import { AuthGuard } from "@dashboard/lib/auth-guard";
import { AgentResponsibilityControl } from "@dashboard/lib/components/AgentResponsibilityControl";
import { buildKodyMetadata } from "../../metadata";

export const dynamic = "force-dynamic";

export const metadata = buildKodyMetadata({
  title: "Responsibility - Kody Operations Dashboard",
  description: "View a selected Kody responsibility.",
  path: "/agent-responsibilities",
});

export default async function SelectedAgentResponsibilityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <AuthGuard>
      <AgentResponsibilityControl selectedSlug={slug} />
    </AuthGuard>
  );
}

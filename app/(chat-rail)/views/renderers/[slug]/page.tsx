/**
 * @fileType page
 * @domain view-renderers
 * @pattern view-renderer-detail-page
 * @ai-summary Deep-link route for one renderer in the state-repo renderer
 *   manager.
 */
import { AuthGuard } from "@dashboard/lib/auth-guard";
import { ViewRenderersManager } from "@dashboard/lib/components/ViewRenderersManager";
import { buildKodyMetadata } from "../../../../metadata";

export const dynamic = "force-static";
export const revalidate = false;
export const fetchCache = "force-cache";

export const metadata = buildKodyMetadata({
  title: "View Renderer — Kody Operations Dashboard",
  description: "Manage one renderer JSON for structured chat UI.",
  path: "/views/renderers",
});

export default async function ViewRendererDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <AuthGuard>
      <ViewRenderersManager initialSlug={slug} />
    </AuthGuard>
  );
}

/**
 * @fileType page
 * @domain view-renderers
 * @pattern view-renderers-page
 * @ai-summary Manager for renderer JSON definitions stored in the state repo
 *   under `views/renderers/`.
 */
import { AuthGuard } from "@dashboard/lib/auth-guard";
import { ViewRenderersManager } from "@dashboard/lib/components/ViewRenderersManager";
import { buildKodyMetadata } from "../../../metadata";

export const dynamic = "force-static";
export const revalidate = false;
export const fetchCache = "force-cache";

export const metadata = buildKodyMetadata({
  title: "View Renderers — Kody Operations Dashboard",
  description: "Manage renderer JSON for structured chat UI.",
  path: "/views/renderers",
});

export default function ViewRenderersPage() {
  return (
    <AuthGuard>
      <ViewRenderersManager />
    </AuthGuard>
  );
}

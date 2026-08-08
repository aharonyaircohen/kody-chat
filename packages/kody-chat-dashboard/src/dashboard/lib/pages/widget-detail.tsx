/**
 * @fileType page
 * @domain kody-chat
 * @pattern shared-page
 * @ai-summary Canonical Widget detail page — resolves the selected widget from
 *   the route slug while the manager owns list and detail rendering.
 */
import { AuthGuard } from "../auth-guard";
import { WidgetsManager } from "../components/WidgetsManager";

export default async function WidgetDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <AuthGuard>
      <WidgetsManager initialSlug={slug} />
    </AuthGuard>
  );
}

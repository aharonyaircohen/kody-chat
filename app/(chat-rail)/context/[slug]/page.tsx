/**
 * @fileType page
 * @domain context
 * @pattern context-selected-page
 * @ai-summary Selected Context route. Keeps context entry selection
 * addressable at `/context/<slug>`.
 */
import { AuthGuard } from "@dashboard/lib/auth-guard";
import { ContextControl } from "@dashboard/lib/components/ContextControl";
import { buildKodyMetadata } from "../../../metadata";

export const dynamic = "force-dynamic";

export const metadata = buildKodyMetadata({
  title: "Context Entry - Kody Operations Dashboard",
  description: "View a selected Kody context entry.",
  path: "/context",
});

export default async function SelectedContextPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <AuthGuard>
      <ContextControl selectedSlug={slug} />
    </AuthGuard>
  );
}

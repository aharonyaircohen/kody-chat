/**
 * @fileType page
 * @domain kody-chat
 * @pattern shared-page
 * @ai-summary Canonical Context detail page — hosts serve it as a one-line
 *   re-export (see pages-coverage specs in each host).
 */
import { AuthGuard } from "../auth-guard";
import { ContextControl } from "../components/ContextControl";

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

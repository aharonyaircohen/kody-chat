/**
 * @fileType page
 * @domain kody-chat
 * @pattern shared-page
 * @ai-summary Canonical Memory detail page — hosts serve it as a one-line
 *   re-export (see pages-coverage specs in each host).
 */
import { AuthGuard } from "../auth-guard";
import { MemoryManager } from "../components/MemoryManager";

export default async function SelectedMemoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AuthGuard>
      <MemoryManager selectedId={id} />
    </AuthGuard>
  );
}

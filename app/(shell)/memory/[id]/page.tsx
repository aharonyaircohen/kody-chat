/**
 * @fileType page
 * @domain kody
 * @pattern memory-selected-page
 * @ai-summary Selected Memory route. Keeps memory selection addressable at
 * `/memory/<id>`.
 */
import { AuthGuard } from "@dashboard/lib/auth-guard";
import { MemoryManager } from "@dashboard/lib/components/MemoryManager";
import { buildKodyMetadata } from "../../../metadata";

export const dynamic = "force-dynamic";

export const metadata = buildKodyMetadata({
  title: "Memory - Kody Operations Dashboard",
  description: "View a selected Kody memory file.",
  path: "/memory",
});

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

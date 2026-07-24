/**
 * @fileType page
 * @domain memory
 * @pattern memory-files-page
 * @ai-summary Deep links into the Memory file workspace.
 */
import { MemoryFilesView } from "@dashboard/lib/components/MemoryFilesView";
import { buildKodyMetadata } from "../../../metadata";

export const metadata = buildKodyMetadata({
  title: "Memory - Kody Operations Dashboard",
  description: "View a selected Kody memory file.",
  path: "/memory",
});
export const dynamic = "force-dynamic";

export default async function MemoryPathRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <MemoryFilesView initialPath={id.endsWith(".md") ? id : `${id}.md`} />
  );
}

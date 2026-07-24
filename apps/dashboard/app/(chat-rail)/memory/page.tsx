/**
 * @fileType page
 * @domain memory
 * @pattern memory-files-page
 * @ai-summary Memory page — the shared file-manager workspace over memory
 *   markdown entries.
 */
import { MemoryFilesView } from "@dashboard/lib/components/MemoryFilesView";
import { buildKodyMetadata } from "../../metadata";

export const metadata = buildKodyMetadata({
  title: "Memory — Kody Operations Dashboard",
  description: "Manage persistent Kody memory.",
  path: "/memory",
});
export const dynamic = "force-dynamic";

export default function MemoryPage() {
  return <MemoryFilesView />;
}

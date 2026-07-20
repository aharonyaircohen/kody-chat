/**
 * @fileType page
 * @domain preview
 * @pattern preview-selected-environment-page
 * @ai-summary Selected Preview environment route. Keeps environment selection
 * addressable at `/preview/<id>`.
 */
import { PreviewWorkspace } from "@dashboard/features/previews/components/PreviewWorkspace";
import { buildKodyMetadata } from "../../../metadata";

export const dynamic = "force-dynamic";

export const metadata = buildKodyMetadata({
  title: "View — Kody Operations Dashboard",
  description: "View a selected saved preview environment.",
  path: "/preview",
});

export default async function SelectedPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PreviewWorkspace selectedId={id} />;
}

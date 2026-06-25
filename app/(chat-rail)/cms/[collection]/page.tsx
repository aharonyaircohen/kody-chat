import { CmsManager } from "@dashboard/lib/components/CmsManager";
import { buildKodyMetadata } from "../../../metadata";

export const dynamic = "force-dynamic";

export const metadata = buildKodyMetadata({
  title: "CMS Collection - Kody Operations Dashboard",
  description: "Browse a selected configured CMS collection.",
  path: "/cms",
});

export default async function CmsCollectionPage({
  params,
}: {
  params: Promise<{ collection: string }>;
}) {
  const { collection } = await params;
  return <CmsManager selectedCollectionName={decodeURIComponent(collection)} />;
}

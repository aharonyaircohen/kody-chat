import { AuthGuard } from "@dashboard/lib/auth-guard";
import { CapabilitiesWorkspace } from "@dashboard/features/admin/components/CapabilitiesManager";
import { buildKodyMetadata } from "../../../../metadata";

export const dynamic = "force-dynamic";

export const metadata = buildKodyMetadata({
  title: "Capabilities — Kody Operations Dashboard",
  description: "Browse and edit capability folders.",
  path: "/capabilities",
});

export default async function CapabilityFilesWorkspacePage({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path = [] } = await params;
  return (
    <AuthGuard>
      <CapabilitiesWorkspace initialPath={path.join("/")} />
    </AuthGuard>
  );
}

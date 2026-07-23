import { AuthGuard } from "@dashboard/lib/auth-guard";
import { AgencyDefinitionsView } from "@dashboard/features/admin/components/AgencyDefinitionsView";
import { buildKodyMetadata } from "../../metadata";

export const dynamic = "force-dynamic";

export const metadata = buildKodyMetadata({
  title: "Implementations — Kody Operations Dashboard",
  description: "Inspect the technical execution models available to this repository.",
  path: "/implementations",
});

export default function ImplementationsPage() {
  return (
    <AuthGuard>
      <AgencyDefinitionsView kind="implementation" />
    </AuthGuard>
  );
}

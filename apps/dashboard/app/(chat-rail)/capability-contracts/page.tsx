import { AuthGuard } from "@dashboard/lib/auth-guard";
import { AgencyDefinitionsView } from "@dashboard/features/admin/components/AgencyDefinitionsView";
import { buildKodyMetadata } from "../../metadata";

export const dynamic = "force-dynamic";

export const metadata = buildKodyMetadata({
  title: "Capability Contracts — Kody Operations Dashboard",
  description: "Inspect canonical capability contracts.",
  path: "/capability-contracts",
});

export default function CapabilityContractsPage() {
  return (
    <AuthGuard>
      <AgencyDefinitionsView kind="capability" />
    </AuthGuard>
  );
}

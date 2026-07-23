import { AuthGuard } from "@dashboard/lib/auth-guard";
import { CapabilityContractsView } from "@dashboard/features/admin/components/CapabilityContractsView";
import { buildKodyMetadata } from "../../metadata";

export const dynamic = "force-dynamic";

export const metadata = buildKodyMetadata({
  title: "Capability Contracts — Kody Operations Dashboard",
  description: "Inspect canonical Capability contracts.",
  path: "/capability-contracts",
});

export default function CapabilityContractsPage() {
  return (
    <AuthGuard>
      <CapabilityContractsView />
    </AuthGuard>
  );
}

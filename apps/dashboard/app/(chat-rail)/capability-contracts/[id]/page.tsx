import { AuthGuard } from "@dashboard/lib/auth-guard";
import { CapabilityContractsView } from "@dashboard/features/admin/components/CapabilityContractsView";
import { buildKodyMetadata } from "../../../metadata";

export const dynamic = "force-dynamic";

export const metadata = buildKodyMetadata({
  title: "Capability Contract — Kody Operations Dashboard",
  description: "Inspect a canonical Capability contract.",
  path: "/capability-contracts",
});

export default async function CapabilityContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AuthGuard>
      <CapabilityContractsView selectedId={id} />
    </AuthGuard>
  );
}

import { AuthGuard } from "@dashboard/lib/auth-guard";
import { AgencyDefinitionsView } from "@dashboard/features/admin/components/AgencyDefinitionsView";
import { buildKodyMetadata } from "../../../metadata";

export const dynamic = "force-dynamic";

export const metadata = buildKodyMetadata({
  title: "Capability Contract — Kody Operations Dashboard",
  description: "Inspect a canonical capability contract.",
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
      <AgencyDefinitionsView kind="capability" selectedId={id} />
    </AuthGuard>
  );
}

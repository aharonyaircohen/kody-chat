import { AuthGuard } from "@dashboard/lib/auth-guard";
import { AgencyOverview } from "@dashboard/features/agency/components/AgencyOverview";
import { buildKodyMetadata } from "../../metadata";

export const metadata = buildKodyMetadata({
  title: "Agency overview — Kody Operations Dashboard",
  description: "The Agency's plain-text intent.",
  path: "/agency",
});

export default function AgencyPage() {
  return (
    <AuthGuard>
      <AgencyOverview />
    </AuthGuard>
  );
}

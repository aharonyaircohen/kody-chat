import { AuthGuard } from "@dashboard/lib/auth-guard";
import { ImplementationsView } from "@dashboard/features/admin/components/ImplementationsView";
import { buildKodyMetadata } from "../../metadata";

export const dynamic = "force-dynamic";

export const metadata = buildKodyMetadata({
  title: "Implementations — Kody Operations Dashboard",
  description: "Inspect technical execution models available to this repository.",
  path: "/implementations",
});

export default function ImplementationsPage() {
  return (
    <AuthGuard>
      <ImplementationsView />
    </AuthGuard>
  );
}

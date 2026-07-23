import { AuthGuard } from "@dashboard/lib/auth-guard";
import { ImplementationsView } from "@dashboard/features/admin/components/ImplementationsView";
import { buildKodyMetadata } from "../../../metadata";

export const dynamic = "force-dynamic";

export const metadata = buildKodyMetadata({
  title: "Implementation — Kody Operations Dashboard",
  description: "Inspect a technical execution model.",
  path: "/implementations",
});

export default async function ImplementationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AuthGuard>
      <ImplementationsView selectedId={id} />
    </AuthGuard>
  );
}

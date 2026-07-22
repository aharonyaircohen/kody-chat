import type { Metadata } from "next";
import { AgencyDefinitionsView } from "@dashboard/features/admin/components/AgencyDefinitionsView";

export const metadata: Metadata = {
  title: "Operation — Kody Operations Dashboard",
  description: "Inspect one AI Agency responsibility boundary.",
};

export default async function SelectedOperationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AgencyDefinitionsView kind="operation" selectedId={id} />;
}

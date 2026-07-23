import type { Metadata } from "next";
import { OperationsView } from "@dashboard/lib/components/OperationsView";

export const metadata: Metadata = {
  title: "Operation — Kody Operations Dashboard",
  description: "Inspect one AI Agency responsibility boundary.",
};

export default function SelectedOperationPage() {
  return <OperationsView />;
}

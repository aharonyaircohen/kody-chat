/** @fileType page @domain agency-operations @pattern operations-page */
import type { Metadata } from "next";
import { OperationsView } from "@dashboard/lib/components/OperationsView";

export const metadata: Metadata = {
  title: "Operations — Kody Operations Dashboard",
  description: "Manage durable AI Agency responsibility boundaries.",
};

export default function OperationsPage() {
  return <OperationsView />;
}

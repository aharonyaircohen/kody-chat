/** @fileType page @domain agency-operations @pattern operations-page */
import type { Metadata } from "next";
import { AgencyDefinitionsView } from "@dashboard/features/admin/components/AgencyDefinitionsView";

export const metadata: Metadata = {
  title: "Operations — Kody Operations Dashboard",
  description: "Manage durable AI Agency responsibility boundaries.",
};

export default function OperationsPage() {
  return <AgencyDefinitionsView kind="operation" />;
}

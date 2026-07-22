import type { Metadata } from "next";
import { KnowledgeSystemPage } from "@dashboard/features/knowledge-system/components/KnowledgeSystemPage";
import { buildKodyMetadata } from "../../metadata";

export const metadata: Metadata = buildKodyMetadata({
  title: "Knowledge System — Kody",
  description: "Explore the connected knowledge of this repository.",
  path: "/knowledge-system",
});

export default function Page() {
  return <KnowledgeSystemPage />;
}

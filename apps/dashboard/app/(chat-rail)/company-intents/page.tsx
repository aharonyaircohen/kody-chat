/**
 * @fileType page
 * @domain kody
 * @pattern companyIntents
 * @ai-summary AI Agency intents page for CTO manager guidance.
 */
import { CompanyIntentsView } from "@dashboard/lib/components/CompanyIntentsView";
import { buildKodyMetadata } from "../../metadata";

export const metadata = buildKodyMetadata({
  title: "Intents - Kody Operations Dashboard",
  description: "CTO AI Agency guidance for goals, loops, and capabilities.",
  path: "/company-intents",
});

export default function CompanyIntentsPage() {
  return <CompanyIntentsView />;
}

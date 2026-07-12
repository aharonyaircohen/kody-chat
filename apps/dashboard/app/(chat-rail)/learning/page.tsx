import { AgencyStatePage } from "@dashboard/lib/components/AgencyStatePage";
import { buildKodyMetadata } from "../../metadata";

export const metadata = buildKodyMetadata({
  title: "Learning - Kody Operations Dashboard",
  description: "Traceable changes made by the AI Agency operating loop.",
  path: "/learning",
});

export default function LearningRoute() {
  return <AgencyStatePage view="learnings" />;
}

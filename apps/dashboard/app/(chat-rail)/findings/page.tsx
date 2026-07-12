import { AgencyStatePage } from "@dashboard/lib/components/AgencyStatePage";
import { buildKodyMetadata } from "../../metadata";

export const metadata = buildKodyMetadata({
  title: "Findings - Kody Operations Dashboard",
  description: "Problems recorded by the AI Agency observer.",
  path: "/findings",
});

export default function FindingsRoute() {
  return <AgencyStatePage view="findings" />;
}

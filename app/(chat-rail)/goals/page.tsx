/**
 * @fileType page
 * @domain kody
 * @pattern managed-goals-page
 * @ai-summary Full managed-goals page for engine goal state files.
 */

import { ManagedGoalsView } from "@dashboard/lib/components/ManagedGoalsView";
import { buildKodyMetadata } from "../../metadata";

export const metadata = buildKodyMetadata({
  title: "Goals - Kody Operations Dashboard",
  description: "Manage engine goals for this repository.",
  path: "/goals",
});

export default function GoalsPage() {
  return <ManagedGoalsView />;
}

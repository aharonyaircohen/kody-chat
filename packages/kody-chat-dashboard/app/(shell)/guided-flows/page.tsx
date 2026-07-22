import { buildKodyMetadata } from "../../metadata";

export const metadata = buildKodyMetadata({
  title: "Guided Flows - Kody Operations Dashboard",
  description: "Resume and manage step-by-step Guided Flows.",
  path: "/guided-flows",
});

export { default } from "../../../src/dashboard/lib/pages/guided-flows";

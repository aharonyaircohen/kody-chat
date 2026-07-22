import { buildKodyMetadata } from "../../metadata";

export const metadata = buildKodyMetadata({
  title: "User Journeys - Kody Operations Dashboard",
  description: "Monitor and run critical user journeys.",
  path: "/user-journeys",
});

export { default } from "../../../src/dashboard/lib/pages/user-journeys";

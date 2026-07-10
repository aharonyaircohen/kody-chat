/**
 * @fileType page
 * @pattern package-page-reexport
 * @ai-summary This URL serves the canonical shared page from the package —
 *   this file only registers the route.
 */
import { buildKodyMetadata } from "../../../metadata";

export const metadata = buildKodyMetadata({
  title: "Brand - Kody Operations Dashboard",
  description: "View a selected client chat brand.",
  path: "/brands",
});

export { default } from "../../../../src/dashboard/lib/pages/brand-detail";

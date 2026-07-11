/**
 * @fileType page
 * @pattern package-page-reexport
 * @ai-summary This URL serves the canonical shared page from the package —
 *   this file only registers the route.
 */
import { buildKodyMetadata } from "../../../metadata";

export const metadata = buildKodyMetadata({
  title: "Memory - Kody Operations Dashboard",
  description: "View a selected Kody memory file.",
  path: "/memory",
});

export { default } from "../../../../src/dashboard/lib/pages/memory-detail";

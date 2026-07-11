/**
 * @fileType page
 * @pattern package-page-reexport
 * @ai-summary This URL serves the canonical shared page from the package —
 *   this file only registers the route.
 */
import { buildKodyMetadata } from "../../../../metadata";

export const metadata = buildKodyMetadata({
  title: "View Renderer - Kody Operations Dashboard",
  description: "Manage one renderer JSON for structured chat UI.",
  path: "/views/renderers",
});

export { default } from "../../../../../src/dashboard/lib/pages/view-renderer-detail";

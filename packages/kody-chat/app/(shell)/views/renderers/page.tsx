/**
 * @fileType page
 * @pattern package-page-reexport
 * @ai-summary This URL serves the canonical shared page from the package —
 *   this file only registers the route.
 */
import { buildKodyMetadata } from "../../../metadata";

export const metadata = buildKodyMetadata({
  title: "View Renderers - Kody Operations Dashboard",
  description: "Manage renderer JSON for structured chat UI.",
  path: "/views/renderers",
});

export { default } from "../../../../src/dashboard/lib/pages/view-renderers";

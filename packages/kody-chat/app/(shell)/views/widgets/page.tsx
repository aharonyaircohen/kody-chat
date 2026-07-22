/**
 * @fileType page
 * @pattern package-page-reexport
 * @ai-summary This URL serves the canonical shared page from the package —
 *   this file only registers the route.
 */
import { buildKodyMetadata } from "../../../metadata";

export const metadata = buildKodyMetadata({
  title: "Widgets - Kody Operations Dashboard",
  description: "Publish per-tenant widget bundles for chat surfaces.",
  path: "/views/widgets",
});

export { default } from "../../../../src/dashboard/lib/pages/widgets";

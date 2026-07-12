/**
 * @fileType page
 * @pattern package-page-reexport
 * @ai-summary This URL serves the canonical shared page from
 *   @kody-ade/kody-chat — this file only registers the route.
 */
import { buildKodyMetadata } from "../../metadata";

export const metadata = buildKodyMetadata({
  title: "Guides — Kody Operations Dashboard",
  description: "Ordered teaching steps that guide the chat model.",
  path: "/guides",
});
export const dynamic = "force-static";
export const revalidate = false;
export const fetchCache = "force-cache";

export { default } from "@kody-ade/kody-chat/pages/guides";

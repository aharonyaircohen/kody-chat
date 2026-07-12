/**
 * @fileType api-endpoint
 * @domain guides
 * @pattern package-route-reexport
 * @ai-summary Guides API — thin re-export of the package-owned handlers
 *   (@kody-ade/kody-chat).
 */
export { GET, POST } from "@kody-ade/kody-chat/routes/kody/guides";

export const dynamic = "force-dynamic";
export const revalidate = 0;

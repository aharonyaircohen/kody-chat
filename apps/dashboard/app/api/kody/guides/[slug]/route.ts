/**
 * @fileType api-endpoint
 * @domain guides
 * @pattern package-route-reexport
 * @ai-summary Guide delete API — thin re-export of the package-owned
 *   handler (@kody-ade/kody-chat).
 */
export { DELETE } from "@kody-ade/kody-chat/routes/kody/guides-detail";

export const dynamic = "force-dynamic";
export const revalidate = 0;

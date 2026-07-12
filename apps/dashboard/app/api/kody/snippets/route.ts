/**
 * @fileType api-endpoint
 * @domain snippets
 * @pattern package-route-reexport
 * @ai-summary Snippets API — thin re-export of the package-owned handlers
 *   (@kody-ade/kody-chat).
 */
export { GET, POST } from "@kody-ade/kody-chat/routes/kody/snippets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

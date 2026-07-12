/**
 * @fileType api-endpoint
 * @domain lessons
 * @pattern package-route-reexport
 * @ai-summary Lessons API — thin re-export of the package-owned handlers
 *   (@kody-ade/kody-chat).
 */
export { GET, POST } from "@kody-ade/kody-chat/routes/kody/lessons";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * @fileType api-endpoint
 * @domain lessons
 * @pattern package-route-reexport
 * @ai-summary Lesson delete API — thin re-export of the package-owned
 *   handler (@kody-ade/kody-chat).
 */
export { DELETE } from "@kody-ade/kody-chat/routes/kody/lessons-detail";

export const dynamic = "force-dynamic";
export const revalidate = 0;

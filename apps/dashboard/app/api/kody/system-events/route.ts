/**
 * @fileType api-endpoint
 * @domain events
 * @pattern package-route-reexport
 * @ai-summary Browser system-events bridge — thin re-export of the
 *   package-owned handler (@kody-ade/kody-chat).
 */
export { POST } from "@kody-ade/kody-chat/routes/kody/system-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

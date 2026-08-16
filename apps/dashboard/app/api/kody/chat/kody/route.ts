/**
 * Dashboard route boundary for the package-owned Kody chat endpoint.
 *
 * Keep Next.js segment settings here because they cannot be re-exported.
 */
import "./dashboard-host-tools";
import "./dashboard-feature-guides";

export { POST } from "@kody-ade/kody-chat-dashboard/routes/kody/chat-kody";

export const runtime = "nodejs";
export const maxDuration = 800;

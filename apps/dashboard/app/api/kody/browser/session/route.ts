/** Repository browser session route; implementation lives in Flyhub. */
export { GET, POST } from "@kody-ade/fly/routes/browser-session";

// Next.js route config must remain literal in the app route file.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

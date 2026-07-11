/**
 * @fileType api-route
 * @domain client-auth
 * @pattern nextauth-handler
 * @ai-summary Auth.js route for brand-scoped client sign-in (Google OAuth
 *   redirect + callback + session endpoints). Public by design — this IS the
 *   login flow. Dashboard operator auth is unrelated (header-based PAT).
 */
import { handlers } from "@dashboard/lib/client-auth/auth";

export const { GET, POST } = handlers;

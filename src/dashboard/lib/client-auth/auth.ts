/**
 * @fileType utility
 * @domain client-auth
 * @pattern nextauth-instance
 * @ai-summary Auth.js (NextAuth v5) instance for brand-scoped client users.
 *   Fully stateless: JWT session cookie signed with a KODY_MASTER_KEY-derived
 *   secret, Google as the only provider, no database. Lazy config so Google
 *   credentials can come from the connected repo's vault per request.
 *   Separate from dashboard operator auth (header-based PAT) by design.
 */
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import { parseClientBrandRepoCookie, CLIENT_BRAND_REPO_COOKIE } from "../client-brand-repo-cookie";
import { resolveGoogleCredentials } from "./credentials";
import { deriveClientAuthSecret } from "./secret";

export const CLIENT_AUTH_SESSION_COOKIE = "kody_client_session";

export const { handlers, auth, signIn, signOut } = NextAuth(async (req) => {
  const repoContext = parseClientBrandRepoCookie(
    req?.cookies.get(CLIENT_BRAND_REPO_COOKIE)?.value,
  );
  const google = await resolveGoogleCredentials(repoContext);

  return {
    secret: deriveClientAuthSecret(),
    session: { strategy: "jwt" },
    trustHost: true,
    providers: google
      ? [
          Google({
            clientId: google.clientId,
            clientSecret: google.clientSecret,
          }),
        ]
      : [],
    cookies: {
      sessionToken: { name: CLIENT_AUTH_SESSION_COOKIE },
    },
    pages: {
      // Sign-in happens on the branded page itself; errors return there too.
      error: "/client",
    },
  };
});

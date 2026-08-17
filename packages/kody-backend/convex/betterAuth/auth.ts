import { createClient } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import type { GenericCtx } from "@convex-dev/better-auth/utils";
import { betterAuth } from "better-auth";
import type { BetterAuthOptions } from "better-auth";
import authConfig from "../auth.config";

import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";

export const authComponent = createClient<DataModel>(components.betterAuth);

function socialProviders(): BetterAuthOptions["socialProviders"] {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const githubClientId = process.env.GITHUB_CLIENT_ID;
  const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;

  return {
    ...(googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        }
      : {}),
    ...(githubClientId && githubClientSecret
      ? {
          github: {
            clientId: githubClientId,
            clientSecret: githubClientSecret,
          },
        }
      : {}),
  };
}

function testAuthOptions(): BetterAuthOptions["emailAndPassword"] {
  if (process.env.KODY_TEST_AUTH_ENABLED !== "true") return undefined;
  return {
    enabled: true,
    requireEmailVerification: false,
  };
}

export function createAuth(ctx: GenericCtx<DataModel>) {
  const siteUrl = process.env.SITE_URL;
  return betterAuth({
    appName: "Kody",
    baseURL: process.env.CONVEX_SITE_URL,
    trustedOrigins: siteUrl ? [siteUrl] : [],
    secret: process.env.BETTER_AUTH_SECRET,
    database: authComponent.adapter(ctx),
    socialProviders: socialProviders(),
    emailAndPassword: testAuthOptions(),
    account: {
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
      },
    },
    session: {
      expiresIn: 30 * 24 * 60 * 60,
      updateAge: 0,
    },
    plugins: [convex({ authConfig })],
  });
}

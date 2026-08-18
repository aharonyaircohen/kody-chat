import { createClient } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import type { GenericCtx } from "@convex-dev/better-auth/utils";
import { betterAuth } from "better-auth";
import type { BetterAuthOptions } from "better-auth";
import authConfig from "../auth.config";
import { authSiteUrl, authTrustedOrigins } from "./trustedOrigins";

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

export function createAuth(ctx: GenericCtx<DataModel>) {
  return betterAuth({
    appName: "Kody",
    baseURL: authSiteUrl(process.env),
    trustedOrigins: authTrustedOrigins(process.env),
    secret: process.env.BETTER_AUTH_SECRET,
    database: authComponent.adapter(ctx),
    socialProviders: socialProviders(),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      requireEmailVerification: false,
    },
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

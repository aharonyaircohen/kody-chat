/**
 * @fileType page
 * @domain client-chat
 * @pattern client-chat-route
 * @ai-summary Brand-scoped client chat route. It renders a standalone shell
 *   around the real KodyChat and stays outside the dashboard chat rail.
 *   Two URL shapes:
 *     /client/<brandSlug>                 — legacy; repo context comes from
 *       the dashboard cookie or the configured default repo.
 *     /client/<owner>/<repo>/<brandSlug>  — self-contained; the link itself
 *       names the repo the brand lives in, so any visitor on any device
 *       resolves the right context (kody-state stays repo-agnostic).
 */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

// Package-owned (hosts deleted their copies) — must stay relative.
import { ClientChatSurface } from "../../../src/dashboard/lib/components/ClientChatSurface";
import {
  resolveClientBrand,
  type ClientBrandResolveContext,
} from "@dashboard/lib/client-brand";
import { getClientSurfaceCatalog } from "../../../src/dashboard/lib/client-chat-strings";
import { resolveClientLanguageStrings } from "../../../src/dashboard/lib/client-language";
import {
  CLIENT_BRAND_REPO_COOKIE,
  parseClientBrandRepoCookie,
  type ClientBrandRepoContext,
} from "@dashboard/lib/client-brand-repo-cookie";
import { mintClientSurfaceTicket } from "../../../src/dashboard/lib/chat/platform/surface-scope";
import { resolveVaultGithubToken } from "@dashboard/lib/vault/bootstrap";
import { defaultClientBrandRepoContext } from "@dashboard/lib/client-brand-default-repo";
import { auth, signIn, signOut } from "@dashboard/lib/client-auth/auth";
import {
  brandAuthProviders,
  isEmailAllowed,
} from "@dashboard/lib/client-auth/allowlist";
import { resolveConfiguredProviders } from "@dashboard/lib/client-auth/credentials";
import { ClientAuthGate } from "../../../src/dashboard/lib/client-auth/ClientAuthGate";

interface ClientChatPageProps {
  params: Promise<{ path: string[] }>;
}

/** Parsed URL shape: brand slug plus (for 3-segment links) the repo. */
interface ClientChatRoute {
  brandSlug: string;
  /** Explicit repo context from the URL; null for legacy 1-segment links. */
  urlContext: ClientBrandRepoContext | null;
  /** The path the surface should return to after auth round-trips. */
  callbackUrl: string;
}

const OWNER_REPO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

function parseClientChatRoute(
  path: string[] | undefined,
): ClientChatRoute | null {
  if (!Array.isArray(path)) return null;
  const segments = path.map((segment) => decodeURIComponent(segment).trim());
  if (segments.some((segment) => !segment)) return null;

  if (segments.length === 1) {
    return {
      brandSlug: segments[0],
      urlContext: null,
      callbackUrl: `/client/${encodeURIComponent(segments[0])}`,
    };
  }
  if (segments.length === 3) {
    const [owner, repo, brandSlug] = segments;
    if (!OWNER_REPO_PATTERN.test(owner) || !OWNER_REPO_PATTERN.test(repo)) {
      return null;
    }
    return {
      brandSlug,
      urlContext: { owner, repo },
      callbackUrl: `/client/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(brandSlug)}`,
    };
  }
  return null;
}

async function withVaultToken(
  context: ClientBrandRepoContext,
): Promise<ClientBrandResolveContext> {
  const token = await resolveVaultGithubToken(context.owner, context.repo);
  return {
    ...context,
    ...(token ? { token } : {}),
  };
}

/**
 * Resolve the brand plus the repo context it was found under. A repo named
 * in the URL wins outright. Legacy links fall back to the dashboard cookie,
 * then the configured default repo (client visitors don't carry the
 * dashboard's brand-repo cookie, and since the cookie started tracking the
 * last-visited repo it may point at a repo with no brands at all).
 */
async function resolveBrandAndContext(route: ClientChatRoute): Promise<{
  brand: Awaited<ReturnType<typeof resolveClientBrand>>;
  context: ClientBrandResolveContext | null;
}> {
  const { brandSlug, urlContext } = route;

  if (urlContext) {
    const context = await withVaultToken(urlContext);
    return { brand: await resolveClientBrand(brandSlug, context), context };
  }

  const cookieStore = await cookies();
  const cookieContext = parseClientBrandRepoCookie(
    cookieStore.get(CLIENT_BRAND_REPO_COOKIE)?.value,
  );

  if (cookieContext) {
    const context = await withVaultToken(cookieContext);
    const brand = await resolveClientBrand(brandSlug, context);
    // Repo brands carry their auth block; a builtin/default fallback does
    // not, so a brand without one may live in the default repo instead.
    if (brand?.auth) return { brand, context };
  }

  const defaultContext = defaultClientBrandRepoContext();
  if (
    defaultContext &&
    (defaultContext.owner !== cookieContext?.owner ||
      defaultContext.repo !== cookieContext?.repo)
  ) {
    const context = await withVaultToken(defaultContext);
    const brand = await resolveClientBrand(brandSlug, context);
    if (brand) return { brand, context };
  }

  if (cookieContext) {
    const context = await withVaultToken(cookieContext);
    return { brand: await resolveClientBrand(brandSlug, context), context };
  }
  return { brand: await resolveClientBrand(brandSlug, null), context: null };
}

export async function generateMetadata({
  params,
}: ClientChatPageProps): Promise<Metadata> {
  const { path } = await params;
  const route = parseClientChatRoute(path);
  if (!route) notFound();
  const { brand, context } = await resolveBrandAndContext(route);
  if (!brand) notFound();

  const languageStrings = await resolveClientLanguageStrings(
    brand.locale ?? "en",
    context,
  );
  const catalog = getClientSurfaceCatalog(brand.locale ?? "en", languageStrings);

  return {
    title: catalog.t("chat.client.metaTitle", { brand: brand.name }),
    description: catalog.t("chat.client.metaDescription", {
      brand: brand.name,
    }),
  };
}

export default async function ClientChatPage({ params }: ClientChatPageProps) {
  const { path } = await params;
  const route = parseClientChatRoute(path);
  if (!route) notFound();
  const { brand, context } = await resolveBrandAndContext(route);
  if (!brand) notFound();

  const languageStrings = await resolveClientLanguageStrings(
    brand.locale ?? "en",
    context,
  );

  let surfaceUser:
    | { name?: string | null; email?: string | null; image?: string | null }
    | undefined;

  const callbackUrl = route.callbackUrl;
  if (brand.auth?.required) {
    const providers = await resolveConfiguredProviders(
      brandAuthProviders(brand.auth),
      context,
    );
    if (!providers.length) {
      return (
        <ClientAuthGate
          brand={brand}
          callbackUrl={callbackUrl}
          misconfigured
          languageStrings={languageStrings}
        />
      );
    }
    const session = await auth();
    const email = session?.user?.email;
    if (!email) {
      if (providers.length === 1) {
        // Single method → straight to the provider, no interstitial click.
        await signIn(providers[0], { redirectTo: callbackUrl });
        return null;
      }
      return (
        <ClientAuthGate
          brand={brand}
          callbackUrl={callbackUrl}
          providers={providers}
          languageStrings={languageStrings}
        />
      );
    }
    if (!isEmailAllowed(brand.auth, email)) {
      return (
        <ClientAuthGate
          brand={brand}
          callbackUrl={callbackUrl}
          deniedEmail={email}
          languageStrings={languageStrings}
        />
      );
    }
    surfaceUser = {
      name: session?.user?.name,
      email,
      image: session?.user?.image,
    };
  }

  let ticket: string | undefined;
  if (context?.token) {
    try {
      ticket = mintClientSurfaceTicket({
        brandSlug: brand.slug,
        owner: context.owner,
        repo: context.repo,
      }).ticket;
    } catch {
      ticket = undefined;
    }
  }

  return (
    <ClientChatSurface
      brand={brand}
      surfaceTicket={ticket}
      user={surfaceUser}
      languageStrings={languageStrings}
      signOutAction={
        surfaceUser
          ? async () => {
              "use server";
              await signOut({ redirectTo: callbackUrl });
            }
          : undefined
      }
    />
  );
}

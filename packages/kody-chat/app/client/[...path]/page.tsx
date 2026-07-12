/**
 * @fileType page
 * @domain client-chat
 * @pattern client-chat-route
 * @ai-summary Brand-scoped client chat route. It renders a standalone shell
 *   around the real KodyChat and stays outside the dashboard chat rail.
 *   URL shape: /client/<owner>/<repo>/<brandSlug> — self-contained; the link
 *   itself names the repo the brand lives in, so any visitor on any device
 *   resolves the right context (kody-state stays repo-agnostic).
 */
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

// Package-owned (hosts deleted their copies) — must stay relative.
import { ClientChatSurface } from "../../../src/dashboard/lib/components/ClientChatSurface";
import {
  resolveClientBrand,
  type ClientBrandResolveContext,
} from "@dashboard/lib/client-brand";
import { getClientSurfaceCatalog } from "../../../src/dashboard/lib/client-chat-strings";
import { resolveClientLanguageStrings } from "../../../src/dashboard/lib/client-language";
import { type ClientBrandRepoContext } from "@dashboard/lib/client-brand-repo-cookie";
import { mintClientSurfaceTicket } from "../../../src/dashboard/lib/chat/platform/surface-scope";
import { resolveBackgroundToken } from "@kody-ade/base/auth/background-token";
import { auth, signOut } from "@dashboard/lib/client-auth/auth";
import {
  brandAuthProviders,
  isEmailAllowed,
} from "@dashboard/lib/client-auth/allowlist";
import { resolveConfiguredProviders } from "@dashboard/lib/client-auth/credentials";
import { ClientAuthGate } from "../../../src/dashboard/lib/client-auth/ClientAuthGate";
import { PageViewTracker } from "@dashboard/lib/events/PageViewTracker";
import { createUserOctokit } from "@kody-ade/base/github/core";
import { BrandSnippets } from "@dashboard/lib/snippets/BrandSnippets";
import { getSnippets } from "@dashboard/lib/snippets/store";
import type { SnippetConfig } from "@dashboard/lib/snippets/types";

interface ClientChatPageProps {
  params: Promise<{ path: string[] }>;
}

/** Parsed URL shape: brand slug plus the repo it lives in. */
interface ClientChatRoute {
  brandSlug: string;
  /** Repo context from the URL. */
  urlContext: ClientBrandRepoContext;
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
  // App installation token first, vault GITHUB_TOKEN fallback — the state
  // repo may be private, so an unauthenticated vault bootstrap can't read it.
  const background = await resolveBackgroundToken(context.owner, context.repo);
  return {
    ...context,
    ...(background ? { token: background.token } : {}),
  };
}

/** Resolve the brand from the repo named in the URL. */
async function resolveBrandAndContext(route: ClientChatRoute): Promise<{
  brand: Awaited<ReturnType<typeof resolveClientBrand>>;
  context: ClientBrandResolveContext;
}> {
  const context = await withVaultToken(route.urlContext);
  return { brand: await resolveClientBrand(route.brandSlug, context), context };
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
        // Kick off via the start route (not signIn() here) so the NextAuth
        // config sees a request that names the brand's repo.
        redirect(
          `/api/client-auth/start?provider=${encodeURIComponent(providers[0])}&redirectTo=${encodeURIComponent(callbackUrl)}`,
        );
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

  // Brand snippets (analytics tags, widgets, ...) — server-rendered so
  // body-start snippets execute before the app hydrates. Best-effort: a
  // failed read never blocks the page.
  let snippets: readonly SnippetConfig[] = [];
  if (context?.token) {
    try {
      snippets = await getSnippets(
        createUserOctokit(context.token),
        context.owner,
        context.repo,
      );
    } catch {
      snippets = [];
    }
  }

  return (
    <>
      <BrandSnippets snippets={snippets} placement="body-start" />
      <PageViewTracker />
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
      <BrandSnippets snippets={snippets} placement="body-end" />
    </>
  );
}

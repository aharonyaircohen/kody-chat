/**
 * @fileType util
 * @domain client-chat
 * @pattern client-brand-config
 * @ai-summary Chat-layer wrapper over @kody-ade/base/client-brand. The pure
 *   brand data/types/normalizers live in base; this module re-exports them
 *   and keeps `resolveClientBrand`, which reaches into @kody-ade/workspace
 *   brands storage and the github-client request context (not base-clean).
 */
export * from "@kody-ade/base/client-brand";
import {
  getBuiltinClientBrand,
  normalizeClientBrandLocale,
  normalizeClientBrandSlug,
  type ClientBrand,
  type ClientBrandResolveContext,
} from "@kody-ade/base/client-brand";

export async function resolveClientBrand(
  slug: string,
  context?: ClientBrandResolveContext | null,
): Promise<ClientBrand | null> {
  const normalized = normalizeClientBrandSlug(slug);
  let clearContext: (() => void) | null = null;
  try {
    const { findBrandFileFromList, isBrandDeleted } = await import("@kody-ade/workspace/brands");
    if (context?.owner && context.repo) {
      const { clearGitHubContext, setGitHubContext } = await import(
        "./github-client"
      );
      setGitHubContext(
        context.owner,
        context.repo,
        context.token,
        context.storeRepoUrl,
        context.storeRef,
      );
      clearContext = clearGitHubContext;
    }
    if (await isBrandDeleted(normalized)) return null;
    const repoBrand = await findBrandFileFromList(normalized);
    if (repoBrand) {
      return {
        slug: repoBrand.slug,
        name: repoBrand.name,
        accent: repoBrand.accent,
        locale: normalizeClientBrandLocale(repoBrand.locale),
        ...(repoBrand.welcomeText !== undefined
          ? { welcomeText: repoBrand.welcomeText }
          : {}),
        ...(repoBrand.modelId !== undefined
          ? { modelId: repoBrand.modelId }
          : {}),
        ...(repoBrand.agentSlug !== undefined
          ? { agentSlug: repoBrand.agentSlug }
          : {}),
        ...(repoBrand.auth !== undefined ? { auth: repoBrand.auth } : {}),
      };
    }
  } catch {
    // Public /client routes may not have a repo auth context. Keep the
    // existing fallback behavior rather than breaking the client surface.
  } finally {
    clearContext?.();
  }
  return getBuiltinClientBrand(normalized);
}

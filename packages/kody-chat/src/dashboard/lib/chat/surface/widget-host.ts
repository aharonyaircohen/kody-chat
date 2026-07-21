/**
 * @fileType util
 * @domain widgets
 * @pattern widget-host-contract
 * @ai-summary Pure helpers for the widget host: the v1 mount contract
 *   (default export `mount(element, props)` returning an optional cleanup
 *   fn), bundle-URL construction with query-param auth (browser dynamic
 *   import() cannot set headers), and module-shape validation. Kept free of
 *   React so unit tests run in a node environment.
 */

export const WIDGET_CONTRACT_VERSION = 1 as const;

/** Props the host passes to a widget's `mount(element, props)` (contract v1). */
export interface WidgetMountProps {
  /** The `data` value from the widget view node — opaque to kody. */
  data: unknown;
  theme: "dark" | "light";
  /**
   * Submits the widget's outcome exactly like a rendered-view button click:
   * the card's onAction path receives `{ id: actionId, label: actionId,
   * response: actionId, result }`, so guided-flow steps advance and chat
   * replies are sent the same way built-in atoms do it.
   */
  complete: (actionId: string, result?: Record<string, unknown>) => void;
}

export type WidgetCleanup = (() => void) | void;

export type WidgetMount = (
  element: HTMLElement,
  props: WidgetMountProps,
) => WidgetCleanup;

export interface WidgetBundleAuth {
  owner: string;
  repo: string;
  token: string;
}

/**
 * Bundle URL for a widget slug, with the tenant/auth context as query
 * params (`?owner=&repo=&token=`) because `import(url)` cannot attach the
 * x-kody-* headers the rest of the API surface uses.
 */
export function buildWidgetBundleUrl(
  slug: string,
  auth: WidgetBundleAuth,
): string {
  const query = new URLSearchParams({
    owner: auth.owner,
    repo: auth.repo,
    token: auth.token,
  });
  return `/api/kody/widgets/${encodeURIComponent(slug)}?${query.toString()}`;
}

/**
 * Extract the v1 mount function from a dynamically imported widget module.
 * Returns null when the module does not follow the contract.
 */
export function resolveWidgetMount(module: unknown): WidgetMount | null {
  if (!module || typeof module !== "object") return null;
  const mount = (module as { default?: unknown }).default;
  return typeof mount === "function" ? (mount as WidgetMount) : null;
}

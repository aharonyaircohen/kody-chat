/**
 * @fileType util
 * @domain widgets
 * @pattern widget-host-contract
 * @ai-summary Pure helpers for the widget host: its mount contract, scoped CMS
 *   client, reply normalization, bundle-URL construction, and module-shape
 *   validation. Kept free of React so unit tests run in node.
 */

import type {
  CmsDocument,
  CmsListQuery,
  CmsListResult,
} from "@kody-ade/cms/types";

export interface WidgetCmsClient {
  list: (collection: string, query?: CmsListQuery) => Promise<CmsListResult>;
  get: (collection: string, id: string) => Promise<CmsDocument>;
}

/** Props the host passes to a widget's `mount(element, props)`. */
export interface WidgetMountProps {
  /** The `data` value from the widget view node — opaque to kody. */
  data: unknown;
  theme: "dark" | "light";
  /** Repository-scoped access through Kody's existing CMS permission layer. */
  cms: WidgetCmsClient;
  /** Adds assistant feedback without consuming the current view. */
  reply: (message: string) => void;
  /**
   * Submits the widget's outcome exactly like a rendered-view button click:
   * the card's onAction path receives `{ id: actionId, label: actionId,
   * response: actionId, result }`, so the host can consume the view and
   * advance its GuidedFlow step.
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

type WidgetFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

interface CmsDocumentResponse {
  document?: CmsDocument;
}

function cmsCollectionPath(collection: string): string {
  return `/api/kody/cms/${encodeURIComponent(collection)}`;
}

function buildCmsListUrl(collection: string, query: CmsListQuery): string {
  const params = new URLSearchParams();
  if (query.filters && Object.keys(query.filters).length > 0) {
    params.set("filters", JSON.stringify(query.filters));
  }
  if (query.search?.query) {
    params.set("q", query.search.query);
    if (query.search.fields?.length) {
      params.set("searchFields", query.search.fields.join(","));
    }
  }
  if (query.sort?.length) {
    params.set(
      "sort",
      query.sort
        .filter((entry) => entry.field)
        .map(
          (entry) =>
            `${entry.field}:${entry.direction === "desc" ? "desc" : "asc"}`,
        )
        .join(","),
    );
  }
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.offset !== undefined) params.set("offset", String(query.offset));
  for (const id of query.ids ?? []) params.append("ids", id);
  const serialized = params.toString();
  return `${cmsCollectionPath(collection)}${serialized ? `?${serialized}` : ""}`;
}

async function requestCmsJson(
  fetcher: WidgetFetch,
  input: string,
  init: RequestInit,
): Promise<unknown> {
  const response = await fetcher(input, { cache: "no-store", ...init });
  if (!response.ok) {
    throw new Error(`CMS request failed (${response.status})`);
  }
  return await response.json().catch(() => {
    throw new Error("CMS returned an invalid response");
  });
}

function requireCmsDocument(value: unknown): CmsDocument {
  const document = (value as CmsDocumentResponse | null)?.document;
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("CMS returned an invalid document");
  }
  return document;
}

function requireCmsList(value: unknown): CmsListResult {
  const result = value as Partial<CmsListResult> | null;
  if (
    !result ||
    !Array.isArray(result.docs) ||
    typeof result.total !== "number" ||
    typeof result.limit !== "number" ||
    typeof result.offset !== "number"
  ) {
    throw new Error("CMS returned an invalid document list");
  }
  return result as CmsListResult;
}

/**
 * Creates a CMS facade for a widget. Authentication stays inside the host
 * closure; the widget receives operations, never repository credentials.
 */
export function createWidgetCmsClient(
  authHeaders: Readonly<Record<string, string>>,
  fetcher: WidgetFetch = fetch,
): WidgetCmsClient {
  const request = (input: string, init: RequestInit = {}) =>
    requestCmsJson(fetcher, input, {
      ...init,
      headers: { ...authHeaders, ...(init.headers ?? {}) },
    });
  return {
    list: (collection, query = {}) =>
      request(buildCmsListUrl(collection, query)).then(requireCmsList),
    get: (collection, id) =>
      request(`${cmsCollectionPath(collection)}/${encodeURIComponent(id)}`, {
        method: "GET",
      }).then(requireCmsDocument),
  };
}

export function normalizeWidgetReply(message: string): string | null {
  const normalized = message.trim();
  return normalized || null;
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
 * Extract the mount function from a dynamically imported widget module.
 * Returns null when the module does not follow the contract.
 */
export function resolveWidgetMount(module: unknown): WidgetMount | null {
  if (!module || typeof module !== "object") return null;
  const mount = (module as { default?: unknown }).default;
  return typeof mount === "function" ? (mount as WidgetMount) : null;
}

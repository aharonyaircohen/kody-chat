/**
 * @fileType data
 * @domain client-chat
 * @pattern client-language-config
 * @ai-summary Client-surface language packs. English ships built-in; other
 *   languages are operator-managed JSON files at `languages/<code>.json` in
 *   the state repo. A brand's `locale` selects the language pack.
 */

export interface ClientLanguage {
  /** BCP-47-ish code, normalized lowercase (e.g. "en", "he", "fr-ca"). */
  code: string;
  /** Human-readable language name shown in the dashboard. */
  name: string;
  /** Flat catalog-key → text map (subset of CLIENT_LANGUAGE_STRING_KEYS). */
  strings: Record<string, string>;
}

export interface ClientLanguageResolveContext {
  owner: string;
  repo: string;
  token?: string;
  storeRepoUrl?: string;
  storeRef?: string;
}

export const DEFAULT_CLIENT_LANGUAGE_CODE = "en";

/**
 * Every client-surface string a language pack may override. Keys are the
 * chat platform catalog keys; `{param}` placeholders are substituted by
 * `catalog.t`. Unknown keys in a language file are dropped on write.
 */
export const CLIENT_LANGUAGE_STRING_KEYS = [
  "chat.client.metaTitle",
  "chat.client.metaDescription",
  "chat.client.chatRegionLabel",
  "chat.client.dir",
  "chat.client.signOut",
  "chat.client.welcome",
  "chat.client.auth.misconfigured",
  "chat.client.auth.adminHint",
  "chat.client.auth.denied",
  "chat.client.auth.switchAccount",
  "chat.client.auth.signIn",
  "chat.client.auth.continueWith",
] as const;

export type ClientLanguageStringKey =
  (typeof CLIENT_LANGUAGE_STRING_KEYS)[number];

/** Operator-facing labels for the editor UI, keyed by catalog key. */
export const CLIENT_LANGUAGE_STRING_LABELS: Record<
  ClientLanguageStringKey,
  string
> = {
  "chat.client.metaTitle": "Browser tab title ({brand} available)",
  "chat.client.metaDescription": "Meta description ({brand} available)",
  "chat.client.chatRegionLabel": "Chat region accessibility label",
  "chat.client.dir": 'Text direction: "rtl" or "ltr" (empty = auto by locale)',
  "chat.client.signOut": "Sign out button",
  "chat.client.welcome": "Welcome message (empty = chat default)",
  "chat.client.auth.misconfigured": "Sign-in not configured notice",
  "chat.client.auth.adminHint": "Admin setup hint",
  "chat.client.auth.denied": "Access denied ({email} available)",
  "chat.client.auth.switchAccount": "Switch account button",
  "chat.client.auth.signIn": "Sign-in prompt",
  "chat.client.auth.continueWith": "Provider button ({provider} available)",
};

/** Built-in English defaults. `chat.client.welcome` is intentionally empty:
 *  an empty value means "use the chat's default empty-state welcome". */
export const EN_CLIENT_LANGUAGE: ClientLanguage = {
  code: "en",
  name: "English",
  strings: {
    "chat.client.metaTitle": "{brand} Chat",
    "chat.client.metaDescription": "Chat with {brand}.",
    "chat.client.chatRegionLabel": "Kody chat",
    "chat.client.dir": "",
    "chat.client.signOut": "Sign out",
    "chat.client.welcome": "",
    "chat.client.auth.misconfigured":
      "This space requires sign-in, but sign-in isn't set up yet. Please contact whoever manages this space.",
    "chat.client.auth.adminHint":
      "Admin: add the provider's client ID on the Variables page (e.g. GOOGLE_CLIENT_ID) and its secret on the Secrets page (e.g. GOOGLE_CLIENT_SECRET) to enable sign-in.",
    "chat.client.auth.denied": "{email} does not have access to this space.",
    "chat.client.auth.switchAccount": "Switch account",
    "chat.client.auth.signIn": "Sign in to continue.",
    "chat.client.auth.continueWith": "Continue with {provider}",
  },
};

const LANGUAGE_CODE_RE = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/;

export function normalizeClientLanguageCode(input?: string): string {
  const normalized = (input ?? "").trim().toLowerCase().replace(/_/g, "-");
  return LANGUAGE_CODE_RE.test(normalized)
    ? normalized
    : DEFAULT_CLIENT_LANGUAGE_CODE;
}

export function isValidLanguageCode(code: string): boolean {
  return LANGUAGE_CODE_RE.test(code);
}

/** Keep only known catalog keys with string values (empty string is allowed —
 *  it means "suppress / use default"). */
export function pickKnownLanguageStrings(
  strings: Record<string, string>,
): Record<string, string> {
  const known = new Set<string>(CLIENT_LANGUAGE_STRING_KEYS);
  return Object.fromEntries(
    Object.entries(strings).filter(
      ([key, value]) => known.has(key) && typeof value === "string",
    ),
  );
}

/**
 * Resolve the merged string map for a locale: built-in English defaults,
 * overlaid with the repo's `languages/<code>.json` pack when one exists.
 * Mirrors `resolveClientBrand`'s context handling — public /client routes
 * may not carry a repo auth context, in which case English is served.
 */
export async function resolveClientLanguageStrings(
  locale: string,
  context?: ClientLanguageResolveContext | null,
): Promise<Record<string, string>> {
  const code = normalizeClientLanguageCode(locale);
  const base = { ...EN_CLIENT_LANGUAGE.strings };
  if (code === DEFAULT_CLIENT_LANGUAGE_CODE) return base;

  let clearContext: (() => void) | null = null;
  try {
    const { findLanguageFileFromList } = await import("./languages");
    if (context?.owner && context.repo) {
      const { clearGitHubContext, setGitHubContext } = await import(
        "@dashboard/lib/github-client"
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
    const pack = await findLanguageFileFromList(code);
    if (pack) return { ...base, ...pack.strings };
  } catch {
    // Missing repo context or GitHub errors must never break the client
    // surface — fall back to English defaults.
  } finally {
    clearContext?.();
  }
  return base;
}

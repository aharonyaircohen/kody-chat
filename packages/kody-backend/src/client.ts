import { ConvexHttpClient } from "convex/browser"
import { deepEscapeKeys, deepUnescapeKeys } from "./escape-keys"

// Convex reserves object keys starting with `$`/`_` (the wire rejects them
// before any function runs), so escaping cannot live server-side. Every
// client wraps here: args are deep-escaped on the way in, results are
// deep-unescaped on the way out, and callers never see the scheme.

type CallMethod = "query" | "mutation" | "action"
const CALL_METHODS: readonly CallMethod[] = ["query", "mutation", "action"]

/**
 * Wraps a ConvexHttpClient so query/mutation/action args have reserved-prefix
 * keys escaped and results are unescaped — any payload round-trips intact.
 */
export function withEscapedKeys(client: ConvexHttpClient): ConvexHttpClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (CALL_METHODS.includes(prop as CallMethod)) {
        const method = Reflect.get(target, prop, target) as (
          fn: unknown,
          args?: unknown,
        ) => Promise<unknown>
        return async (fn: unknown, args?: unknown) => {
          const result = await method.call(
            target,
            fn,
            args === undefined ? undefined : deepEscapeKeys(args),
          )
          return deepUnescapeKeys(result)
        }
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === "function" ? value.bind(target) : value
    },
  })
}

// Server-side client factory for API routes and runners. The browser side
// should use ConvexReactClient with NEXT_PUBLIC_CONVEX_URL instead (and
// unescape reserved-prefix keys on subscription results).
export function createBackendClient(url = process.env.CONVEX_URL): ConvexHttpClient {
  if (!url) {
    throw new Error("CONVEX_URL not configured")
  }
  return withEscapedKeys(new ConvexHttpClient(url))
}

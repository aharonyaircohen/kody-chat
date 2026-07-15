import { ConvexHttpClient } from "convex/browser"

// Server-side client factory for API routes and runners. The browser side
// should use ConvexReactClient with NEXT_PUBLIC_CONVEX_URL instead.
export function createBackendClient(url = process.env.CONVEX_URL): ConvexHttpClient {
  if (!url) {
    throw new Error("CONVEX_URL not configured")
  }
  return new ConvexHttpClient(url)
}

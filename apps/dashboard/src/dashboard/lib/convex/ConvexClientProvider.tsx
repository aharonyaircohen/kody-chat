/**
 * @fileType component
 * @domain kody
 * @pattern client-provider
 * @ai-summary Optional Convex live-subscription provider. Mounts a
 *   ConvexReactClient (from NEXT_PUBLIC_CONVEX_URL) around the app so
 *   `useConvexLive` hooks get reactive queries. When the env var is unset
 *   the provider renders children untouched and every live hook falls back
 *   to interval polling — the dashboard works identically without Convex.
 */
"use client";

import React from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";

/** Build-time constant — identical for every render of this deployment. */
export const CONVEX_LIVE_ENABLED = !!process.env.NEXT_PUBLIC_CONVEX_URL;

let client: ConvexReactClient | null = null;

function getConvexReactClient(): ConvexReactClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  if (!client) client = new ConvexReactClient(url);
  return client;
}

export function ConvexClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const convex = getConvexReactClient();
  if (!convex) return <>{children}</>;
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}

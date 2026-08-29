/**
 * @fileType layout
 * @domain kody
 * @pattern route-group
 * @ai-summary Root layout for Kody dashboard — reuses frontend fonts, theme, and CSS without Header/Footer/i18n
 */
import React from "react";
import type { Metadata } from "next";
import { cn } from "@kody-ade/base/utils/ui";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Assistant } from "next/font/google";

import { KodyProviders } from "./KodyProviders";
import { ChatRailShell } from "@dashboard/lib/components/ChatRailShell";
import { Toaster } from "@kody-ade/base/ui/toaster";
import {
  defaultTheme,
  themeLocalStorageKey,
} from "@dashboard/providers/Theme/shared";
import "@dashboard/globals.css";

const assistant = Assistant({
  subsets: ["latin", "hebrew"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-assistant",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SERVER_URL?.trim() || "http://localhost:3333",
  ),
  title: {
    default: "Kody Operations Dashboard",
    template: "%s | Kody Operations",
  },
  // PWA: lets iOS Safari treat the site as installable. Combined with
  // `apple-touch-icon` below, "Add to Home Screen" produces a real PWA icon
  // and `display: standalone` from manifest.json makes it run chromeless.
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Kody",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg" }],
  },
};

// IMPORTANT: Keep this layout synchronous. An async root layout that fetches
// server-side (e.g. `await getKodyAuthToken()`) fails the production build
// with `TypeError: fetch failed` when the upstream endpoint is unreachable
// (CI, offline, or pre-deploy). All auth/identity work happens in
// client-mounted providers (`KodyProviders` → `ConvexClientProvider` +
// `AuthProvider`); this layout only owns static chrome.
// CI run 33258141082 (PR #24) verified: root layout is synchronous.
export default function KodyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No server-side async fetch here. Auth is client-only.
  return (
    <html
      className={cn(GeistSans.variable, GeistMono.variable, assistant.variable)}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        {/* Reuse the same theme init logic as the frontend layout */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                function getImplicitPreference() {
                  var mql = window.matchMedia('(prefers-color-scheme: dark)');
                  if (typeof mql.matches === 'boolean') {
                    return mql.matches ? 'dark' : 'light';
                  }
                  return null;
                }
                var themeToSet = '${defaultTheme}';
                var preference = window.localStorage.getItem('${themeLocalStorageKey}');
                if (preference === 'light' || preference === 'dark') {
                  themeToSet = preference;
                } else {
                  var implicit = getImplicitPreference();
                  if (implicit) themeToSet = implicit;
                }
                document.documentElement.setAttribute('data-theme', themeToSet);
              })();
            `,
          }}
        />
        <link href="/favicon.ico" rel="icon" sizes="32x32" />
        <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
      </head>
      <body>
        <KodyProviders>
          <ChatRailShell>{children}</ChatRailShell>
          <Toaster />
        </KodyProviders>
      </body>
    </html>
  );
}

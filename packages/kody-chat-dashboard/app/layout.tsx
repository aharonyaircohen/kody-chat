/**
 * @fileType layout
 * @domain kody-chat
 * @pattern root-layout
 * @ai-summary Root layout for kody-chat — brand-themed client chat product, no admin rail
 */
import React from "react";
import type { Metadata } from "next";
import { cn } from "@kody-ade/base/utils/ui";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Assistant } from "next/font/google";

import { KodyProviders } from "./KodyProviders";
import { Toaster } from "@kody-ade/base/ui/toaster";
import {
  defaultTheme,
  themeLocalStorageKey,
} from "../src/dashboard/providers/Theme/shared";
import "../src/dashboard/globals.css";

const assistant = Assistant({
  subsets: ["latin", "hebrew"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-assistant",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SERVER_URL?.trim() || "http://localhost:3344",
  ),
  title: {
    default: "Kody Chat",
    template: "%s | Kody Chat",
  },
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

export default function KodyChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      className={cn(GeistSans.variable, GeistMono.variable, assistant.variable)}
      lang="en"
      suppressHydrationWarning
    >
      <head>
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
        <link href="/icon.svg" rel="icon" type="image/svg+xml" />
      </head>
      <body>
        <KodyProviders>
          {children}
          <Toaster />
        </KodyProviders>
      </body>
    </html>
  );
}

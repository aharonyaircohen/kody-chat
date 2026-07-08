"use client";

import type { CSSProperties } from "react";
import type { BrandConfig } from "@dashboard/lib/brand/config";
import { KodyChat } from "./KodyChat";

interface BrandClientChatProps {
  brand: BrandConfig;
}

export function BrandClientChat({ brand }: BrandClientChatProps) {
  const themeStyle = {
    "--background": brand.theme.background,
    "--foreground": brand.theme.foreground,
    "--primary": brand.theme.primary,
    "--primary-foreground": "0 0% 100%",
    "--muted": "210 40% 94%",
    "--muted-foreground": "215 16% 35%",
    "--border": "214 32% 82%",
    "--accent": brand.theme.accent,
    "--accent-foreground": brand.theme.foreground,
  } as CSSProperties;

  return (
    <main className="h-screen overflow-hidden bg-background" style={themeStyle}>
      <KodyChat lockedAgentId="kody" clientSurface />
    </main>
  );
}

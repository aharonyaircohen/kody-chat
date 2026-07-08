/**
 * @fileType component
 * @domain client-chat
 * @pattern route-shell
 * @ai-summary Public/client route shell that frames the real KodyChat without
 *   mounting dashboard chrome or changing admin chat behavior.
 */
"use client";

import { Zap } from "lucide-react";

import type { ClientBrand } from "@dashboard/lib/client-brand";
import { KodyChat } from "./KodyChat";

export function ClientChatSurface({ brand }: { brand: ClientBrand }) {
  return (
    <main
      data-testid="client-chat-surface"
      className="flex h-dvh min-h-dvh flex-col bg-background text-foreground"
    >
      <header className="shrink-0 border-b border-border bg-background px-4 py-3">
        <div className="flex w-full items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white shadow-sm"
              style={{ backgroundColor: brand.accent }}
              aria-hidden="true"
            >
              <Zap className="h-4 w-4" />
            </span>
            <span
              data-testid="client-brand-name"
              className="truncate text-base font-semibold"
            >
              {brand.name}
            </span>
          </div>
        </div>
      </header>

      <div
        aria-label="Kody chat"
        className="flex min-h-0 w-full flex-1 flex-col"
      >
        <KodyChat presentation="standalone" hideTerminalMode railFullscreen />
      </div>
    </main>
  );
}

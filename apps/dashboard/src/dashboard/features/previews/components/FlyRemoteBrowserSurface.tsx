/**
 * @fileType component
 * @domain preview
 * @pattern fly-remote-browser-surface
 * @ai-summary noVNC canvas connected to the authenticated Fly Chromium
 *   session. This replaces only the rendering surface; PreviewBrowser owns UI.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@kody-ade/base/ui/button";

interface FlyRemoteBrowserSurfaceProps {
  streamUrl: string;
  title: string;
  maxWidthPx?: number;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export function FlyRemoteBrowserSurface({
  streamUrl,
  title,
  maxWidthPx,
  onConnected,
  onDisconnected,
}: FlyRemoteBrowserSurfaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reconnectAttemptsRef = useRef(0);
  const [connected, setConnected] = useState(false);
  const [disconnected, setDisconnected] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let rfb: import("@novnc/novnc").default | null = null;

    void import("@novnc/novnc").then(({ default: RFB }) => {
      if (disposed) return;
      rfb = new RFB(container, streamUrl, { shared: true });
      rfb.scaleViewport = true;
      rfb.resizeSession = true;
      rfb.clipViewport = true;
      rfb.background = "#09090b";
      rfb.addEventListener("connect", () => {
        reconnectAttemptsRef.current = 0;
        setConnected(true);
        setDisconnected(false);
        onConnected?.();
      });
      rfb.addEventListener("disconnect", () => {
        if (disposed) return;
        setConnected(false);
        setDisconnected(true);
        if (reconnectAttemptsRef.current < 5) {
          reconnectAttemptsRef.current += 1;
          window.setTimeout(() => {
            if (!disposed) onDisconnected?.();
          }, 2_000);
        }
      });
      rfb.focus();
    });

    return () => {
      disposed = true;
      rfb?.disconnect();
      container.replaceChildren();
    };
  }, [onConnected, onDisconnected, streamUrl]);

  return (
    <div className="relative flex h-full w-full justify-center bg-zinc-900">
      <div
        data-remote-browser-surface
        ref={containerRef}
        role="application"
        aria-label={title}
        style={maxWidthPx ? { maxWidth: `${maxWidthPx}px` } : undefined}
        className="h-full w-full overflow-hidden bg-white [&_canvas]:h-full [&_canvas]:w-full"
      />
      {!connected && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
          <div className="flex flex-col items-center gap-3 text-center">
            {!disconnected && (
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            )}
            <p className="text-sm text-zinc-300">
              {disconnected ? "Browser disconnected" : "Starting browser…"}
            </p>
            {disconnected && (
              <Button type="button" variant="outline" onClick={onDisconnected}>
                Reconnect
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

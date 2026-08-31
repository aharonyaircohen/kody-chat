"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  actInBrowserSession,
  fetchBrowserSession,
  startBrowserSession,
  type BrowserSessionStatus,
  type RemoteBrowserAction,
  type RemoteBrowserActionResult,
} from "./browser-session-client";

type ActiveRemoteSession = Extract<
  BrowserSessionStatus,
  { mode: "remote"; sessionId: string }
>;

export type BrowserSessionMode =
  | { kind: "disabled" }
  | { kind: "checking" }
  | { kind: "iframe"; reason: string }
  | { kind: "remote"; session: ActiveRemoteSession }
  | { kind: "error"; error: string };

export function useBrowserSession(input: {
  enabled: boolean;
  actorLogin?: string;
  initialUrl: string | null;
}) {
  const [mode, setMode] = useState<BrowserSessionMode>(
    input.enabled ? { kind: "checking" } : { kind: "disabled" },
  );
  const generationRef = useRef(0);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const connect = useCallback(async () => {
    if (!input.enabled || !input.initialUrl) {
      setMode({ kind: "disabled" });
      return;
    }
    if (!input.actorLogin) {
      setMode({ kind: "checking" });
      return;
    }
    const generation = ++generationRef.current;
    setMode({ kind: "checking" });
    try {
      const status = await fetchBrowserSession(input.actorLogin);
      if (generation !== generationRef.current) return;
      if (status.mode === "iframe") {
        setMode({ kind: "iframe", reason: status.reason });
        return;
      }
      const session =
        status.state === "idle"
          ? await startBrowserSession(input.actorLogin, input.initialUrl)
          : status;
      if (generation !== generationRef.current) return;
      setMode({ kind: "remote", session });
    } catch (error) {
      if (generation !== generationRef.current) return;
      setMode({
        kind: "error",
        error: error instanceof Error ? error.message : "browser_session_failed",
      });
    }
  }, [input.actorLogin, input.enabled, input.initialUrl]);

  useEffect(() => {
    void connect();
    return () => {
      generationRef.current += 1;
    };
  }, [connect]);

  const act = useCallback(
    async (action: RemoteBrowserAction): Promise<RemoteBrowserActionResult> => {
      const currentMode = modeRef.current;
      if (currentMode.kind !== "remote" || !input.actorLogin) {
        return { ok: false, error: "browser_session_unavailable" };
      }
      const result = await actInBrowserSession(
        input.actorLogin,
        currentMode.session.sessionId,
        action,
      );
      if (result.url) {
        setMode((current) =>
          current.kind === "remote"
            ? {
                kind: "remote",
                session: { ...current.session, currentUrl: result.url! },
              }
            : current,
        );
      }
      return result;
    },
    [input.actorLogin],
  );

  return { mode, act, reconnect: connect };
}

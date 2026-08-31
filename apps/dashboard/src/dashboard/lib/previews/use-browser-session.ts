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
  const initialUrlRef = useRef(input.initialUrl);
  modeRef.current = mode;
  initialUrlRef.current = input.initialUrl;

  const connect = useCallback(
    async (forceStart = false) => {
      const initialUrl = initialUrlRef.current;
      if (!input.enabled || !initialUrl) {
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
        let session =
          forceStart || status.state === "idle"
            ? await startBrowserSession(input.actorLogin, initialUrl)
            : status;
        if (
          !forceStart &&
          status.state !== "idle" &&
          status.currentUrl !== initialUrl
        ) {
          const navigation = await actInBrowserSession(
            input.actorLogin,
            status.sessionId,
            { type: "navigate", url: initialUrl },
          );
          session = {
            ...status,
            currentUrl: navigation.url ?? initialUrl,
          };
        }
        if (generation !== generationRef.current) return;
        setMode({ kind: "remote", session });
      } catch (error) {
        if (generation !== generationRef.current) return;
        setMode({
          kind: "error",
          error:
            error instanceof Error ? error.message : "browser_session_failed",
        });
      }
    },
    [input.actorLogin, input.enabled],
  );

  useEffect(() => {
    void connect(false);
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

  const reconnect = useCallback(() => connect(true), [connect]);

  return { mode, act, reconnect };
}

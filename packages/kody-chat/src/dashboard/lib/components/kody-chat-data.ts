/**
 * @fileType hook
 * @domain kody
 * @pattern kody-chat-data
 * @ai-summary KodyChat's async data sources extracted from KodyChat
 *   (phase 1.6c): the user-managed chat model list (/api/kody/models),
 *   the repo-wide dashboard config toggle (brainFlyChatEnabled), and the
 *   per-repo FLY_API_TOKEN vault probe. All sources load on mount and
 *   fail silent — chat keeps working through the engine path with the
 *   affected dropdown rows hidden. Behavior is identical to the
 *   pre-extraction inline effects.
 *
 *   Placement note: lives in components/ next to the other phase-1.6
 *   extractions (kody-chat-live-runner.ts / kody-chat-send.ts) — it is
 *   KodyChat wiring, not reusable chat/core logic.
 */
"use client";

import { useEffect, useState } from "react";
import type {
  BrainChatModelEntry,
  ChatModelEntry,
} from "../chat/platform/agent-entries";
import { authHeaders } from "../chat/core/kody-chat-live-session";
import {
  composeChatModelCatalog,
  KODY_OPENROUTER_FREE_CHAT_MODEL,
} from "../chat/model-catalog";

export interface ChatDataSources {
  /**
   * User-managed chat models from /api/kody/models (LLM_MODELS variable).
   * Empty until first load completes; the embedded OpenRouter entry is
   * composed when the request resolves.
   */
  chatModels: ChatModelEntry[];
  chatModelsLoaded: boolean;
  /** Personal Brain models configured on /brain. */
  brainModels: BrainChatModelEntry[];
  /**
   * Per-repo opt-in for the "Repo Brain" chat row (backend
   * dashboard.json, default false). Chat-only — does NOT gate Fly task
   * execution.
   */
  brainFlyChatEnabled: boolean;
  /**
   * Mirrors brainConfigured: true only when the per-repo vault holds a
   * non-empty FLY_API_TOKEN. The Fly dropdown row is hidden until then so
   * users can't pick a runner that will fail at start-fly time.
   */
  flyConfigured: boolean;
}

export function hasSecretMetadata(
  payload: unknown,
  secretName: string,
): boolean {
  if (!payload || typeof payload !== "object") return false;
  const secrets = (payload as { secrets?: unknown }).secrets;
  if (!Array.isArray(secrets)) return false;
  return secrets.some(
    (entry) =>
      entry !== null &&
      typeof entry === "object" &&
      (entry as { name?: unknown }).name === secretName,
  );
}

/**
 * KodyChat's mount-time data loads. Each fetch runs once per mount and
 * is independently silent on failure (the corresponding feature just
 * stays hidden / disabled, matching the "not configured" state).
 */
export function useChatDataSources(): ChatDataSources {
  const [chatModels, setChatModels] = useState<ChatModelEntry[]>([]);
  const [chatModelsLoaded, setChatModelsLoaded] = useState(false);
  const [brainModels, setBrainModels] = useState<BrainChatModelEntry[]>([]);
  const [brainFlyChatEnabled, setBrainFlyChatEnabled] = useState(false);
  const [flyConfigured, setFlyConfigured] = useState(false);

  // Compose the server-backed model list with the built-in OpenRouter entry.
  // The built-in entry remains available even when the request fails.
  useEffect(() => {
    let cancelled = false;
    const request = (path: string) =>
      fetch(path, { headers: authHeaders() })
        .then((res) => (res.ok ? res.json() : Promise.reject(res)))
        .catch(() => ({}));
    Promise.all([
      request("/api/kody/models"),
      request("/api/kody/brain/models"),
    ]).then(
      ([modelsJson, brainJson]: [
        { models?: ChatModelEntry[] },
        { models?: BrainChatModelEntry[] },
      ]) => {
        if (cancelled) return;
        const configuredModels = Array.isArray(modelsJson.models)
          ? modelsJson.models
          : [];
        setChatModels(
          composeChatModelCatalog<ChatModelEntry>(
            configuredModels,
            KODY_OPENROUTER_FREE_CHAT_MODEL,
          ),
        );
        setBrainModels(Array.isArray(brainJson.models) ? brainJson.models : []);
        setChatModelsLoaded(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the repo-wide Repo Brain chat toggle once on mount. The default
  // chat entry is no longer fetched here — it's a per-user localStorage
  // preference, read synchronously by the selection hook. Silent on failure.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/kody/dashboard-config", { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then(
        (json: {
          config?: {
            brainFlyChatEnabled?: boolean;
          };
        }) => {
          if (cancelled) return;
          setBrainFlyChatEnabled(json.config?.brainFlyChatEnabled === true);
        },
      )
      .catch(() => {
        if (!cancelled) setBrainFlyChatEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Read secret metadata only. The chat needs to know whether FLY_API_TOKEN
  // exists, never its decrypted value.
  useEffect(() => {
    let cancelled = false;
    const headers = authHeaders();
    if (Object.keys(headers).length === 0) {
      setFlyConfigured(false);
      return;
    }
    fetch("/api/kody/secrets", { headers })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setFlyConfigured(false);
          return;
        }
        const body = await res.json().catch(() => ({}));
        setFlyConfigured(hasSecretMetadata(body, "FLY_API_TOKEN"));
      })
      .catch(() => {
        if (!cancelled) setFlyConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    chatModels,
    chatModelsLoaded,
    brainModels,
    brainFlyChatEnabled,
    flyConfigured,
  };
}

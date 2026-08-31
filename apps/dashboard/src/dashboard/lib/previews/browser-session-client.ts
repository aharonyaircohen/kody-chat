import { buildHeaders } from "@dashboard/lib/api";
import type { PreviewEditCommand } from "@dashboard/lib/picker/protocol";

export type BrowserViewport = { width: number; height: number };

export type BrowserSessionStatus =
  | { mode: "iframe"; reason: string }
  | { mode: "remote"; state: "idle" }
  | {
      mode: "remote";
      sessionId: string;
      state: "starting" | "running" | "suspended" | "failed";
      currentUrl: string;
      viewport: BrowserViewport;
      streamUrl: string;
      ticketExpiresAt: number;
    };

export type RemoteBrowserAction =
  | { type: "navigate"; url: string }
  | { type: "back" }
  | { type: "forward" }
  | { type: "reload" }
  | { type: "viewport"; width: number; height: number }
  | { type: "screenshot" }
  | { type: "snapshot" }
  | { type: "click"; selector: string }
  | { type: "fill"; selector: string; value: string }
  | { type: "scroll"; selector?: string; deltaY: number }
  | { type: "wait"; ms: number }
  | { type: "pick" }
  | { type: "pickResult" }
  | { type: "cancelPick" }
  | { type: "perf" }
  | { type: "edit"; command: PreviewEditCommand }
  | { type: "undoEdit" }
  | { type: "resetEdits"; selector?: string }
  | { type: "recordStart" }
  | { type: "recordStop" };

export interface RemoteBrowserActionResult {
  ok: boolean;
  url?: string;
  title?: string;
  data?: unknown;
  error?: string;
}

async function readResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(data.error ?? `browser_api_${response.status}`);
  return data;
}

export async function fetchBrowserSession(
  actorLogin: string,
): Promise<BrowserSessionStatus> {
  const response = await fetch(
    `/api/kody/browser/session?actorLogin=${encodeURIComponent(actorLogin)}`,
    { headers: buildHeaders(), cache: "no-store" },
  );
  return await readResponse<BrowserSessionStatus>(response);
}

export async function startBrowserSession(
  actorLogin: string,
  initialUrl: string,
): Promise<
  Extract<BrowserSessionStatus, { mode: "remote"; sessionId: string }>
> {
  const response = await fetch("/api/kody/browser/session", {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ operation: "start", actorLogin, initialUrl }),
  });
  return await readResponse(response);
}

export async function actInBrowserSession(
  actorLogin: string,
  sessionId: string,
  action: RemoteBrowserAction,
): Promise<RemoteBrowserActionResult> {
  const response = await fetch("/api/kody/browser/session", {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ operation: "act", actorLogin, sessionId, action }),
  });
  return await readResponse(response);
}

export async function closeBrowserSession(
  actorLogin: string,
  sessionId: string,
): Promise<void> {
  const response = await fetch("/api/kody/browser/session", {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ operation: "close", actorLogin, sessionId }),
  });
  await readResponse(response);
}

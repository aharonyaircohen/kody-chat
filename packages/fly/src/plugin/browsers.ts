/**
 * @fileType plugin
 * @domain infrastructure
 * @pattern fly-browser-provider
 * @ai-summary Fly adapter for isolated interactive Chromium sessions. Reuses
 *   the shared Fly Machines client; browser lifecycle stays separate from
 *   runner and deployment providers.
 */

import { createHash, randomBytes } from "node:crypto";

import type { BrowserProvider } from "@kody-ade/base/infrastructure/contracts";
import {
  allocateSharedIps,
  createApp,
  createMachine,
  destroyApp,
  flyHostname,
  getMachineDiagnostic,
  listMachines,
  startMachine,
  type FlyPreviewConfig,
} from "./previews/machines-client";

export { getMachineDiagnostic as getBrowserMachineDiagnostic };

const BROWSER_READY_TIMEOUT_MS = 60_000;

export async function ensureBrowserSessionReady(
  session: FlyBrowserSession,
): Promise<void> {
  const diagnostic = await getMachineDiagnostic(
    session.appName,
    session.machineId,
    session.config,
  );
  if (!diagnostic) throw new Error("browser_machine_not_found");
  if (diagnostic.state !== "started") {
    await startMachine(session.appName, session.machineId, session.config);
  }

  const deadline = Date.now() + BROWSER_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${session.endpoint}/health`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
      if (response.ok) return;
    } catch {
      // Fly proxy can reset connections while a suspended Machine is waking.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error("browser_machine_not_ready");
}

export interface CreateFlyBrowserSessionInput {
  owner: string;
  repo: string;
  actorId: string;
  sessionId: string;
  initialUrl: string;
  image: string;
  config: FlyPreviewConfig;
  verifyKey: string;
}

export interface FlyBrowserSession {
  providerId: "fly";
  sessionId: string;
  appName: string;
  machineId: string;
  state: string;
  region: string;
  endpoint: string;
  config: FlyPreviewConfig;
  accessTicket?: string;
}

export type FlyBrowserAction =
  | {
      type: "navigate";
      url: string;
      allowedOrigins?: string[];
      capabilitySlug?: string;
    }
  | { type: "back" }
  | { type: "forward" }
  | { type: "reload" }
  | { type: "viewport"; width: number; height: number }
  | { type: "screenshot" }
  | { type: "snapshot" }
  | {
      type: "click";
      selector: string;
      allowedOrigins?: string[];
      capabilitySlug?: string;
    }
  | {
      type: "fill";
      selector: string;
      value: string;
      allowedOrigins?: string[];
      capabilitySlug?: string;
    }
  | {
      type: "upload";
      selector: string;
      uploadId: string;
      allowedOrigins: string[];
      capabilitySlug: string;
    }
  | {
      type: "scroll";
      selector?: string;
      deltaY: number;
      allowedOrigins?: string[];
      capabilitySlug?: string;
    }
  | {
      type: "wait";
      ms: number;
      allowedOrigins?: string[];
      capabilitySlug?: string;
    }
  | { type: "pick" }
  | { type: "pickResult" }
  | { type: "cancelPick" }
  | { type: "perf" }
  | { type: "edit"; command: unknown }
  | { type: "undoEdit" }
  | { type: "resetEdits"; selector?: string }
  | { type: "recordStart" }
  | { type: "recordStop" }
  | {
      type: "pointer";
      action: "move" | "down" | "up" | "wheel";
      x: number;
      y: number;
      deltaX?: number;
      deltaY?: number;
      button?: "left" | "middle" | "right";
    }
  | { type: "keyboard"; action: "down" | "up" | "insertText"; key: string };

export interface FlyBrowserActionResult {
  ok: boolean;
  url?: string;
  title?: string;
  data?: unknown;
  error?: string;
}

function safeNamePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

export function browserAppName(
  input: {
    owner: string;
    repo: string;
    actorId: string;
  },
  instanceId = randomBytes(3).toString("hex"),
): string {
  const readable = safeNamePart(`${input.owner}-${input.repo}`) || "repo";
  const hash = createHash("sha256")
    .update(`${input.owner}/${input.repo}:${input.actorId}`)
    .digest("hex")
    .slice(0, 10);
  return `kody-browser-${readable}-${hash}-${safeNamePart(instanceId)}`.slice(
    0,
    63,
  );
}

async function postBrowserAction(
  session: FlyBrowserSession,
  action: FlyBrowserAction,
): Promise<FlyBrowserActionResult> {
  const response = await fetch(`${session.endpoint}/api/browser/action`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session.accessTicket
        ? { Authorization: `Bearer ${session.accessTicket}` }
        : {}),
    },
    body: JSON.stringify(action),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    return { ok: false, error: `browser_action_${response.status}` };
  }
  return (await response.json()) as FlyBrowserActionResult;
}

export type FlyBrowserProvider = BrowserProvider<
  CreateFlyBrowserSessionInput,
  FlyBrowserSession,
  FlyBrowserAction,
  FlyBrowserActionResult
>;

export const flyBrowserProvider: FlyBrowserProvider = {
  id: "fly",
  area: "browsers",
  capabilities: new Set([
    "real-browser",
    "expose-http",
    "wake",
    "suspend",
    "destroy",
    "inventory",
  ]),
  async createSession(input) {
    const appName = browserAppName(input);
    await createApp(appName, input.config);
    await allocateSharedIps(appName, input.config);

    const existing = (await listMachines(appName, input.config))[0];
    const machine = existing
      ? existing
      : await createMachine(
          {
            appName,
            region: input.config.defaultRegion,
            image: input.image,
            internalPort: 8080,
            memoryMb: 1024,
            cpus: 1,
            env: {
              KODY_BROWSER_SESSION_ID: input.sessionId,
              KODY_BROWSER_REPOSITORY: `${input.owner}/${input.repo}`,
              KODY_BROWSER_ACTOR_ID: input.actorId,
              KODY_BROWSER_INITIAL_URL: input.initialUrl,
              KODY_BROWSER_VERIFY_KEY: input.verifyKey,
            },
          },
          input.config,
        );

    if (existing && existing.state !== "started") {
      await startMachine(appName, existing.id, input.config);
    }

    return {
      providerId: "fly",
      sessionId: input.sessionId,
      appName,
      machineId: machine.id,
      state: machine.state,
      region: machine.region,
      endpoint: flyHostname(appName),
      config: input.config,
    };
  },
  act(session, action) {
    return postBrowserAction(session, action);
  },
  async closeSession(session) {
    await destroyApp(session.appName, session.config);
  },
};

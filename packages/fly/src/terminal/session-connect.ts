/**
 * @fileType use-case
 * @domain terminal
 * @pattern terminal-session-connect
 *
 * Command boundary for opening a Fly terminal session. API routes validate HTTP
 * input; this layer decides target, wake behavior, bridge authority, and token.
 */
import "server-only";

import type { NextRequest } from "next/server";

import { logger } from "@kody-ade/base/logger";
import {
  buildTerminalWebSocketUrl,
  isTerminalFeatureAllowed,
  isTerminalMachineLive,
  isTerminalMachineStartable,
  isTerminalMachineTransitioning,
  resolveTerminalTargetMachine,
  terminalActivityLimitForTarget,
  terminalBridgeSessionIdForTarget,
  type TerminalTargetInput,
} from "@kody-ade/terminal/session";
import { mintTerminalBridgeToken } from "@kody-ade/terminal/terminal-token";

import {
  serverProviderHostname,
  startServerProviderMachine,
  type ServerProviderMachineRow,
  type ServerProviderConfig,
} from "../infrastructure/server-machines";
import {
  serverProviderConfigFromContext,
  type ServerProviderContext,
} from "../infrastructure/server-context";

import {
  findServerProviderTerminalBridge,
  type ServerProviderTerminalBridgeInfo,
} from "../infrastructure/server-terminal";
import {
  loadTerminalInventoryAuthority,
  terminalBridgeConfigCandidates,
  terminalFlyConfigForMachine,
} from "./server-inventory";
import {
  getRemoteRuntimeConnector,
  type RemoteRuntimeWarning,
} from "./remote-runtime-connector";

export interface StartTerminalSessionData {
  target?: "brain";
  app?: string;
  machineId?: string;
  feature?: "runner" | "brain";
  chatSessionId?: string;
  afterRevision?: number;
  activityLimitMs?: number | null;
  cols?: number;
  rows?: number;
}

export class TerminalSessionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const TARGET_STATUS: Record<string, number> = {
  machine_not_found: 404,
  machine_not_terminal_capable: 403,
  machine_not_running: 409,
  fly_access_denied: 403,
};

const TARGET_MESSAGE: Record<string, string> = {
  machine_not_found: "Machine not found.",
  machine_not_terminal_capable: "Only Brain machines can open a Fly terminal.",
  machine_not_running:
    "Brain machine did not become ready in time. Try Connect again.",
  fly_access_denied: "Fly token cannot access this Brain app.",
};

const WAKE_POLL_ATTEMPTS = 60;
const WAKE_POLL_INTERVAL_MS = 1000;
const EDGE_WAKE_TIMEOUT_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function wakeServerProviderMachineThroughEdge(
  app: string,
): Promise<void> {
  try {
    await globalThis.fetch(`https://${serverProviderHostname(app)}/healthz`, {
      redirect: "manual",
      signal: AbortSignal.timeout(EDGE_WAKE_TIMEOUT_MS),
    });
  } catch (err) {
    logger.warn({ err, app }, "terminal: edge wake did not answer");
  }
}

function isFlyBridgeAuthError(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return (
    /Fly Machines API (401|403) on \/(apps|apps\/)/.test(text) ||
    /(startServerProviderMachine|startMachine) failed: (401|403)/.test(text) ||
    /fetch failed|Connect Timeout|ETIMEDOUT|ECONNRESET/i.test(text)
  );
}

function isFlyMachineAlreadyStartingError(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return (
    /(startServerProviderMachine|startMachine) failed: 409/.test(text) &&
    /machine still attempting to start/i.test(text)
  );
}

async function findServerProviderTerminalBridgeForTarget(
  cfg: ReturnType<typeof terminalFlyConfigForMachine>,
): Promise<ServerProviderTerminalBridgeInfo | null> {
  let lastErr: unknown;
  const candidates = terminalBridgeConfigCandidates(cfg);
  for (const candidate of candidates) {
    try {
      const bridge = await findServerProviderTerminalBridge(candidate);
      if (bridge) return bridge;
    } catch (err) {
      lastErr = err;
      if (!isFlyBridgeAuthError(err)) throw err;
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

async function startServerProviderMachineForTarget(
  app: string,
  machineId: string,
  cfg: ReturnType<typeof terminalFlyConfigForMachine>,
): Promise<void> {
  let lastErr: unknown;
  for (const candidate of terminalBridgeConfigCandidates(cfg)) {
    try {
      await startServerProviderMachine(app, machineId, candidate);
      return;
    } catch (err) {
      lastErr = err;
      if (isFlyMachineAlreadyStartingError(err)) return;
      if (!isFlyBridgeAuthError(err)) throw err;
    }
  }
  throw lastErr;
}

function targetError(code: string, details: Record<string, unknown> = {}) {
  return new TerminalSessionError(
    code,
    TARGET_MESSAGE[code] ?? code,
    TARGET_STATUS[code] ?? 400,
    details,
  );
}

export async function startTerminalSession(input: {
  req: NextRequest;
  context: ServerProviderContext;
  data: StartTerminalSessionData;
}) {
  const { req, context, data } = input;
  const cfg = serverProviderConfigFromContext(context);
  if (!cfg) {
    throw new TerminalSessionError(
      "fly_token_missing",
      "fly_token_missing",
      503,
    );
  }

  const brainRequested = data.target === "brain" || data.feature === "brain";
  const { inventory, savedBrain } = await loadTerminalInventoryAuthority(
    req,
    cfg,
    {
      brainRequested,
      app: data.app,
      machineId: data.machineId,
    },
    context,
  );
  if (brainRequested && savedBrain?.brain.reason === "fly_access_denied") {
    throw targetError("fly_access_denied", {
      app: savedBrain.brain.app,
      org: savedBrain.brain.orgSlug,
    });
  }

  let brainWarnings: RemoteRuntimeWarning[] = [];
  let targetInput: TerminalTargetInput | null =
    data.app && data.machineId
      ? {
          app: data.app,
          machineId: data.machineId,
          feature: data.feature,
        }
      : null;
  if (brainRequested) {
    const connectRemoteRuntime = getRemoteRuntimeConnector();
    if (!connectRemoteRuntime) {
      throw targetError("machine_not_found");
    }
    const decision = await connectRemoteRuntime({
      context,
      inventory,
      requestedTarget: targetInput,
    });
    targetInput = decision.targetInput;
    brainWarnings = decision.warnings;
  }

  if (!targetInput) {
    throw targetError("machine_not_found");
  }
  const requested = resolveTerminalTargetMachine(inventory, targetInput);
  if (!requested) {
    throw targetError("machine_not_found");
  }
  return connectTerminalMachine({
    scope: context,
    cfg: terminalFlyConfigForMachine(cfg, requested, savedBrain),
    machine: requested,
    data,
    warnings: brainWarnings,
    refreshMachine: async () => {
      const refreshed = await loadTerminalInventoryAuthority(
        req,
        cfg,
        {
          brainRequested: requested.feature === "brain",
          app: requested.app,
          machineId: requested.machineId,
        },
        context,
      );
      return resolveTerminalTargetMachine(refreshed.inventory, requested);
    },
  });
}

/** Connect an already-authorized machine using the caller's credential authority. */
export async function connectTerminalMachine(input: {
  scope: { owner: string; repo: string };
  workspace?: "machine" | "repository";
  cfg: ServerProviderConfig;
  machine: ServerProviderMachineRow;
  data: StartTerminalSessionData;
  refreshMachine: () => Promise<ServerProviderMachineRow | null>;
  warnings?: RemoteRuntimeWarning[];
}) {
  const { scope: context, cfg: selectedCfg, data, refreshMachine } = input;
  const brainWarnings = input.warnings ?? [];
  let requested = input.machine;
  if (!isTerminalFeatureAllowed(requested.feature)) {
    throw targetError("machine_not_terminal_capable");
  }
  if (!isTerminalMachineLive(requested.state)) {
    const startable = isTerminalMachineStartable(requested.state);
    if (!startable && !isTerminalMachineTransitioning(requested.state)) {
      throw targetError("machine_not_running");
    }
    if (startable) {
      logger.info(
        { app: requested.app, machineId: requested.machineId },
        "terminal: waking machine",
      );
      await startServerProviderMachineForTarget(
        requested.app,
        requested.machineId,
        selectedCfg,
      );
    } else {
      logger.info(
        {
          app: requested.app,
          machineId: requested.machineId,
          state: requested.state,
        },
        "terminal: waiting for machine transition",
      );
    }
    await wakeServerProviderMachineThroughEdge(requested.app);
    for (let attempt = 0; attempt < WAKE_POLL_ATTEMPTS; attempt++) {
      if (attempt > 0) await sleep(WAKE_POLL_INTERVAL_MS);
      const next = await refreshMachine();
      if (
        !next ||
        next.app !== requested.app ||
        next.machineId !== requested.machineId
      ) {
        throw targetError("machine_not_found");
      }
      requested = next;
      if (isTerminalMachineLive(requested.state)) break;
    }
  }
  if (!isTerminalMachineLive(requested.state)) {
    throw targetError("machine_not_running");
  }
  const bridge = await findServerProviderTerminalBridgeForTarget(selectedCfg);
  if (!bridge) {
    throw new TerminalSessionError(
      "terminal_gateway_not_ready",
      "Terminal gateway is not deployed for this Brain runtime.",
      503,
    );
  }
  const activityLimitMs = terminalActivityLimitForTarget(
    requested.feature,
    data.activityLimitMs,
  );
  const now = Math.floor(Date.now() / 1000);
  const bridgeSessionId = terminalBridgeSessionIdForTarget({
    owner: context.owner,
    repo: context.repo,
    app: requested.app,
    machineId: requested.machineId,
    feature: requested.feature,
    requestedChatSessionId: data.chatSessionId,
  });
  const token = mintTerminalBridgeToken({
    owner: context.owner,
    repo: context.repo,
    workspace: input.workspace,
    app: requested.app,
    orgSlug: selectedCfg.orgSlug,
    machineId: requested.machineId,
    privateAddress: requested.privateAddress,
    chatSessionId: bridgeSessionId,
    conversationId: data.chatSessionId ?? bridgeSessionId,
    afterRevision: data.afterRevision,
    ...(activityLimitMs !== undefined ? { activityLimitMs } : {}),
    flyToken: selectedCfg.token,
    cols: data.cols,
    rows: data.rows,
    now,
    secret: bridge.secret,
  });
  const webSocketUrl = buildTerminalWebSocketUrl(bridge.url, token);

  return {
    ok: true,
    app: requested.app,
    machineId: requested.machineId,
    label: requested.label,
    bridgeApp: bridge.app,
    sessionId: bridgeSessionId,
    session: {
      id: bridgeSessionId,
      scope: {
        owner: context.owner,
        repo: context.repo,
        conversationId: data.chatSessionId ?? bridgeSessionId,
      },
      target: {
        kind: "brain" as const,
        runtimeId: requested.machineId,
      },
    },
    expiresAt: new Date((now + 120) * 1000).toISOString(),
    webSocketUrl,
    ...(brainWarnings.length ? { warnings: brainWarnings } : {}),
  };
}

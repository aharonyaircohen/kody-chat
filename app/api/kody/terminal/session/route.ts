/**
 * @fileType api-endpoint
 * @domain terminal
 * @pattern terminal-session-start
 *
 * POST /api/kody/terminal/session
 *
 * Starts a browser terminal session by ensuring the Fly terminal bridge exists
 * and minting a short-lived encrypted token for it. The Fly token stays
 * encrypted inside that token; the dashboard never returns it as plain JSON.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireKodyAuth } from "@dashboard/lib/auth";
import {
  brainFlyRuntimeImageRef,
  brainGhcrAuth,
  prepareBrainRuntimeImage,
} from "@dashboard/lib/brain/image-runtime";
import { readBrainImage, writeBrainApp } from "@dashboard/lib/brain/store";
import {
  clearGitHubContext,
  setGitHubContext,
} from "@dashboard/lib/github-client";
import { logger } from "@dashboard/lib/logger";
import { startMachine } from "@dashboard/lib/previews/fly-previews";
import { provisionBrain } from "@dashboard/lib/runners/brain-fly";
import {
  flyConfigFromContext,
  resolveFlyContext,
} from "@dashboard/lib/runners/fly-context";
import { appendSavedBrainMachineToInventory } from "@dashboard/lib/runners/fly-inventory-server";
import { listFlyInventory } from "@dashboard/lib/runners/fly-inventory";
import type { FlyPreviewConfig } from "@dashboard/lib/previews/fly-previews";
import { ensureTerminalBridge } from "@dashboard/lib/terminal/bridge-fly";
import {
  buildTerminalWebSocketUrl,
  isTerminalFeatureAllowed,
  isTerminalMachineLive,
  isTerminalMachineStartable,
  resolveTerminalTargetMachine,
  selectTerminalTarget,
  terminalActivityLimitForTarget,
} from "@dashboard/lib/terminal/session";
import { mintTerminalBridgeToken } from "@dashboard/lib/terminal/terminal-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  app: z.string().min(1).max(120),
  machineId: z.string().min(1).max(120),
  feature: z.enum(["runner", "brain"]).optional(),
  chatSessionId: z.string().min(1).max(160).optional(),
  resetSession: z.boolean().optional(),
  activityLimitMs: z
    .union([
      z
        .number()
        .int()
        .min(60_000)
        .max(24 * 60 * 60_000),
      z.null(),
    ])
    .optional(),
  cols: z.number().int().min(20).max(300).optional(),
  rows: z.number().int().min(8).max(120).optional(),
});

const TARGET_STATUS: Record<string, number> = {
  machine_not_found: 404,
  machine_not_terminal_capable: 403,
  machine_not_running: 409,
};

const TARGET_MESSAGE: Record<string, string> = {
  machine_not_found: "Machine not found.",
  machine_not_terminal_capable: "Only Brain machines can open a Fly terminal.",
  machine_not_running: "Machine is still waking up. Try Connect again.",
};

const WAKE_POLL_ATTEMPTS = 10;
const WAKE_POLL_INTERVAL_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function terminalTargetFlyConfig(
  cfg: FlyPreviewConfig,
  orgSlug: string | undefined,
): FlyPreviewConfig {
  return orgSlug && orgSlug !== cfg.orgSlug ? { ...cfg, orgSlug } : cfg;
}

async function prepareSelectedBrainImageForTerminal(input: {
  req: NextRequest;
  ctx: Extract<Awaited<ReturnType<typeof resolveFlyContext>>, { ok: true }>;
  app: string;
  orgSlug: string;
  cfg: FlyPreviewConfig;
}): Promise<{ app: string; machineId: string; orgSlug: string } | null> {
  setGitHubContext(
    input.ctx.context.owner,
    input.ctx.context.repo,
    input.ctx.context.githubToken,
    input.ctx.context.storeRepoUrl,
    input.ctx.context.storeRef,
  );
  try {
    const image = await readBrainImage(
      input.ctx.context.account,
      input.ctx.context.githubToken,
    ).catch(() => null);
    if (!image?.imageRef) return null;

    const ghcr = brainGhcrAuth({
      allSecrets: input.ctx.context.allSecrets,
      githubToken: input.ctx.context.githubToken,
      account: input.ctx.context.account,
    });
    const result = await provisionBrain({
      flyToken: input.cfg.token,
      account: input.ctx.context.account,
      model: input.ctx.context.engineModel,
      modelConfig: input.ctx.context.engineModelConfig,
      githubToken: input.ctx.context.githubToken,
      allSecrets: input.ctx.context.allSecrets,
      perfTier: input.ctx.context.perfTier,
      orgSlug: input.orgSlug,
      defaultRegion: input.cfg.defaultRegion,
      dashboardUrl: new URL(input.req.url).origin,
      appNameOverride: input.app,
      imageRef: image.imageRef,
      resolveRuntimeImageRef: ({ app, imageRef }) =>
        Promise.resolve(brainFlyRuntimeImageRef({ app, imageRef })),
      prepareRuntimeImage: async ({
        app,
        sourceImageRef,
        runtimeImageRef,
      }) => {
        await prepareBrainRuntimeImage({
          owner: input.ctx.context.owner,
          repo: input.ctx.context.repo,
          app,
          imageRef: sourceImageRef,
          runtimeImageRef,
          flyToken: input.cfg.token,
          ghcrToken: ghcr.token,
          ghcrUser: ghcr.user,
          orgSlug: input.orgSlug,
          defaultRegion: input.cfg.defaultRegion,
        });
      },
    });
    await writeBrainApp(input.ctx.context.account, input.ctx.context.githubToken, {
      version: 1,
      appName: result.app,
      orgSlug: result.org,
      createdAt: new Date().toISOString(),
    }).catch((err) => {
      logger.warn(
        { err, owner: input.ctx.context.owner, app: result.app },
        "terminal: record Brain app after image selection failed",
      );
    });
    return { app: result.app, machineId: result.machineId, orgSlug: result.org };
  } finally {
    clearGitHubContext();
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const ctx = await resolveFlyContext(req);
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  const cfg = flyConfigFromContext(ctx.context);
  if (!cfg) {
    return NextResponse.json({ error: "fly_token_missing" }, { status: 503 });
  }

  try {
    let inventory = await listFlyInventory(cfg);
    await appendSavedBrainMachineToInventory(req, inventory);
    const requested = resolveTerminalTargetMachine(inventory, parsed.data);
    if (!requested) {
      return NextResponse.json(
        {
          error: "machine_not_found",
          message: TARGET_MESSAGE.machine_not_found,
        },
        { status: TARGET_STATUS.machine_not_found },
      );
    }
    if (!isTerminalFeatureAllowed(requested.feature)) {
      return NextResponse.json(
        {
          error: "machine_not_terminal_capable",
          message: TARGET_MESSAGE.machine_not_terminal_capable,
        },
        { status: TARGET_STATUS.machine_not_terminal_capable },
      );
    }
    let selectedCfg = terminalTargetFlyConfig(cfg, requested.orgSlug);
    let selectedApp = requested.app;
    let selectedMachineId = requested.machineId;
    let selectedLabel = requested.label;
    let selectedFeature = requested.feature;
    if (requested.feature === "brain") {
      const prepared = await prepareSelectedBrainImageForTerminal({
        req,
        ctx,
        app: requested.app,
        orgSlug: selectedCfg.orgSlug,
        cfg: selectedCfg,
      });
      if (prepared) {
        selectedApp = prepared.app;
        selectedMachineId = prepared.machineId;
        selectedCfg = terminalTargetFlyConfig(cfg, prepared.orgSlug);
      }
    }
    if (!isTerminalMachineLive(requested.state)) {
      if (selectedMachineId !== requested.machineId) {
        // The selected image path already produced the machine to connect to.
      } else if (!isTerminalMachineStartable(requested.state)) {
        return NextResponse.json(
          {
            error: "machine_not_running",
            message: TARGET_MESSAGE.machine_not_running,
          },
          { status: TARGET_STATUS.machine_not_running },
        );
      } else {
        logger.info(
          { app: requested.app, machineId: requested.machineId },
          "terminal: waking machine",
        );
        await startMachine(requested.app, requested.machineId, selectedCfg);
        const selectedInput = {
          app: requested.app,
          machineId: requested.machineId,
        };
        for (let attempt = 0; attempt < WAKE_POLL_ATTEMPTS; attempt++) {
          if (attempt > 0) await sleep(WAKE_POLL_INTERVAL_MS);
          inventory = await listFlyInventory(cfg);
          await appendSavedBrainMachineToInventory(req, inventory);
          const next = resolveTerminalTargetMachine(inventory, selectedInput);
          if (next && isTerminalMachineLive(next.state)) break;
        }
      }
    }

    if (selectedMachineId === requested.machineId) {
      const selected = selectTerminalTarget(inventory, {
        app: requested.app,
        machineId: requested.machineId,
      });
      if (!selected.ok) {
        return NextResponse.json(
          { error: selected.error, message: TARGET_MESSAGE[selected.error] },
          { status: TARGET_STATUS[selected.error] ?? 400 },
        );
      }
      selectedCfg = terminalTargetFlyConfig(cfg, selected.machine.orgSlug);
      selectedApp = selected.machine.app;
      selectedMachineId = selected.machine.machineId;
      selectedLabel = selected.machine.label;
      selectedFeature = selected.machine.feature;
    }
    const bridge = await ensureTerminalBridge(selectedCfg);
    const activityLimitMs = terminalActivityLimitForTarget(
      selectedFeature,
      parsed.data.activityLimitMs,
    );
    const now = Math.floor(Date.now() / 1000);
    const token = mintTerminalBridgeToken({
      owner: ctx.context.owner,
      repo: ctx.context.repo,
      app: selectedApp,
      orgSlug: selectedCfg.orgSlug,
      machineId: selectedMachineId,
      chatSessionId: parsed.data.chatSessionId,
      resetSession: parsed.data.resetSession,
      ...(activityLimitMs !== undefined ? { activityLimitMs } : {}),
      flyToken: selectedCfg.token,
      cols: parsed.data.cols,
      rows: parsed.data.rows,
      now,
      secret: bridge.secret,
    });
    const webSocketUrl = buildTerminalWebSocketUrl(bridge.url, token);

    return NextResponse.json({
      ok: true,
      app: selectedApp,
      machineId: selectedMachineId,
      label: selectedLabel,
      bridgeApp: bridge.app,
      expiresAt: new Date((now + 120) * 1000).toISOString(),
      webSocketUrl,
    });
  } catch (err) {
    logger.error(
      { err, owner: ctx.context.owner, repo: ctx.context.repo },
      "terminal: session start failed",
    );
    return NextResponse.json(
      { error: "terminal_session_failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}

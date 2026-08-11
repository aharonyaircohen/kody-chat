/**
 * @fileType api-endpoint
 * @domain brain
 * @pattern brain-terminal-setup
 *
 * Explicitly upgrades the active Brain machine to the current terminal-capable
 * image and installs its stateless terminal gateway. Reconnect never calls this
 * route; only the visible user setup action may replace the Brain machine.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireKodyAuth } from "@kody-ade/base/auth";
import { logger } from "@kody-ade/base/logger";
import { requestOrigin } from "@kody-ade/base/request-origin";
import { resolveServerProviderContext } from "@kody-ade/fly/infrastructure/server-context";

import { BrainCommandError, manageBrainServer } from "../server-commands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError) return authError;

  const resolved = await resolveServerProviderContext(req);
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }

  try {
    return NextResponse.json(
      await manageBrainServer({
        command: "setup-terminal",
        context: resolved.context,
        dashboardUrl: requestOrigin(req),
      }),
    );
  } catch (error) {
    logger.error(
      {
        error,
        owner: resolved.context.owner,
        repo: resolved.context.repo,
      },
      "brain terminal setup failed",
    );
    if (error instanceof BrainCommandError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }
    const status = (error as { status?: number }).status;
    if (status === 401 || status === 403) {
      return NextResponse.json(
        {
          error: "fly_access_denied",
          message: "Fly token cannot access this Brain app.",
        },
        { status: 403 },
      );
    }
    return NextResponse.json(
      {
        error: "terminal_setup_failed",
        message: "Terminal setup failed. Try again.",
      },
      { status: 500 },
    );
  }
}

import type { NextRequest } from "next/server";
import { guidedFlowInternalJsonHeaders } from "./internal-request-headers";

export class GuidedFlowCommandError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

export interface GuidedFlowCommandContext {
  readonly flowData?: Readonly<Record<string, unknown>>;
  readonly previousResult?: Readonly<Record<string, unknown>>;
  readonly actionId?: string;
}

export async function executeGuidedFlowCommand(
  req: NextRequest,
  command: string,
  mutationId: string,
  context?: GuidedFlowCommandContext,
): Promise<Readonly<Record<string, unknown>>> {
  const headers = guidedFlowInternalJsonHeaders(req, mutationId);
  const response = await fetch(new URL("/api/kody/chat/operations", req.url), {
    method: "POST",
    headers,
    body: JSON.stringify({
      input: command,
      ...(context ? { context } : {}),
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    throw new GuidedFlowCommandError(
      typeof payload.error === "string" ? payload.error : "command_failed",
      response.status >= 400 && response.status < 500 ? response.status : 502,
    );
  }
  if (
    payload.handled !== true ||
    !payload.result ||
    typeof payload.result !== "object" ||
    Array.isArray(payload.result)
  ) {
    throw new GuidedFlowCommandError("command_not_executable", 400);
  }
  const result = payload.result as Readonly<Record<string, unknown>>;
  return {
    status:
      result.status === "needs_attention" ? "needs_attention" : "completed",
    summary:
      typeof result.summary === "string"
        ? result.summary
        : "Command completed.",
    ...(typeof result.approvalChallenge === "string"
      ? { approvalChallenge: result.approvalChallenge }
      : {}),
    ...(typeof result.approvalExpiresAt === "string"
      ? { approvalExpiresAt: result.approvalExpiresAt }
      : {}),
    ...(typeof result.runId === "string" ? { runId: result.runId } : {}),
    ...(result.workflowInput &&
    typeof result.workflowInput === "object" &&
    !Array.isArray(result.workflowInput)
      ? { workflowInput: result.workflowInput }
      : {}),
  };
}

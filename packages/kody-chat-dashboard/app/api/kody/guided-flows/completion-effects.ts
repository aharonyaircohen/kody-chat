import { z } from "zod";
import type { NextRequest } from "next/server";

import { api as backendApi } from "@kody-ade/backend/api";
import type { createBackendClient } from "@kody-ade/backend/client";

type BackendClient = ReturnType<typeof createBackendClient>;

interface GuidedFlowEffectRow {
  readonly effectId: string;
  readonly flowId: string;
  readonly flowVersion: number;
  readonly data: unknown;
  readonly attempts: number;
}

export class GuidedFlowCompletionError extends Error {
  constructor(
    readonly code:
      | "guided_flow_workflow_exists"
      | "guided_flow_invalid_workflow"
      | "guided_flow_auth_failed"
      | "guided_flow_rate_limited"
      | "guided_flow_completion_failed",
    readonly status: number,
  ) {
    super(code);
  }
}

function completionErrorFor(
  errorCode: string | undefined,
  status: number,
): GuidedFlowCompletionError {
  if (errorCode === "workflow_exists") {
    return new GuidedFlowCompletionError("guided_flow_workflow_exists", 409);
  }
  if (errorCode === "invalid_workflow" || errorCode === "invalid_body") {
    return new GuidedFlowCompletionError("guided_flow_invalid_workflow", 400);
  }
  if (errorCode === "github_token_expired") {
    return new GuidedFlowCompletionError("guided_flow_auth_failed", 401);
  }
  if (errorCode === "rate_limited") {
    return new GuidedFlowCompletionError("guided_flow_rate_limited", 429);
  }
  return new GuidedFlowCompletionError(
    "guided_flow_completion_failed",
    status >= 400 && status < 500 ? status : 502,
  );
}

async function createWorkflowEffect(
  req: NextRequest,
  effect: GuidedFlowEffectRow,
  actor: string,
  isRetry: boolean,
): Promise<unknown> {
  const input = z
    .object({
      workflowName: z.string().trim().min(1).max(160),
      capabilitySlug: z
        .string()
        .trim()
        .regex(/^[a-z0-9][a-z0-9_-]{0,79}$/),
      actionId: z.literal("approve"),
    })
    .safeParse(effect.data);
  if (!input.success) {
    throw new GuidedFlowCompletionError("guided_flow_invalid_workflow", 400);
  }
  const headers = new Headers(req.headers);
  headers.set("content-type", "application/json");
  headers.set("x-kody-idempotency-key", effect.effectId);
  headers.delete("content-length");
  const response = await fetch(
    new URL("/api/kody/company/workflows", req.url),
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: input.data.workflowName,
        capabilities: [input.data.capabilitySlug],
        actorLogin: actor,
      }),
    },
  );
  const payload = (await response.json().catch(() => ({}))) as {
    workflow?: unknown;
    error?: string;
  };
  // A retry after the workflow was created but before the effect was marked
  // complete reaches the existing unique-name guard. That is success here.
  if (
    isRetry &&
    response.status === 409 &&
    payload.error === "workflow_exists"
  ) {
    return undefined;
  }
  if (!response.ok) throw completionErrorFor(payload.error, response.status);
  return payload.workflow;
}

async function runConsumerEffect(
  req: NextRequest,
  effect: GuidedFlowEffectRow,
  actor: string,
  isRetry: boolean,
): Promise<unknown> {
  if (effect.flowId === "create-workflow") {
    return await createWorkflowEffect(req, effect, actor, isRetry);
  }
  return undefined;
}

export async function processGuidedFlowCompletionEffects(
  req: NextRequest,
  client: BackendClient,
  input: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly instanceId: string;
  },
): Promise<{ readonly workflow?: unknown }> {
  const effects = (await client.query(
    backendApi.guidedFlows.listPendingEffects,
    input,
  )) as GuidedFlowEffectRow[];
  let workflow: unknown;
  for (const effect of effects) {
    try {
      await client.mutation(backendApi.guidedFlows.beginEffect, {
        tenantId: input.tenantId,
        actorId: input.actorId,
        effectId: effect.effectId,
        updatedAt: new Date().toISOString(),
      });
      workflow =
        (await runConsumerEffect(
          req,
          effect,
          input.actorId,
          effect.attempts > 0,
        )) ?? workflow;
      await client.mutation(backendApi.guidedFlows.markEffect, {
        tenantId: input.tenantId,
        actorId: input.actorId,
        effectId: effect.effectId,
        status: "completed",
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      await client.mutation(backendApi.guidedFlows.markEffect, {
        tenantId: input.tenantId,
        actorId: input.actorId,
        effectId: effect.effectId,
        status: "failed",
        updatedAt: new Date().toISOString(),
        lastError: error instanceof Error ? error.message : "Effect failed",
      });
      throw error;
    }
  }
  return workflow === undefined ? {} : { workflow };
}

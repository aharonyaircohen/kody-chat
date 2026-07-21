import { randomUUID } from "node:crypto";
import { tool, type ToolSet } from "ai";
import { z } from "zod";

import { api as backendApi } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import {
  createGuidedFlowInstance,
  type GuidedFlowInstance,
} from "@kody-ade/kody-chat/guided-flows/controller";
import {
  buildGuidedFlowView,
  getGuidedFlowDefinition,
  listGuidedFlowDefinitions,
} from "@kody-ade/kody-chat/guided-flows/registry";
import {
  GUIDED_FLOW_DEFINITIONS_NAMESPACE,
  latestAvailableGuidedFlowDefinitions,
  parseStoredGuidedFlowDefinitions,
} from "@kody-ade/kody-chat/guided-flows/stored";
import type { GuidedFlowDefinition } from "@kody-ade/kody-chat/guided-flows/controller";
import type { RenderedViewDirective } from "@dashboard/lib/chat-ui-actions";

interface GuidedFlowToolContext {
  tenantId: string;
  actorId: string;
}

type GuidedFlowRow = {
  instanceId: string;
  instanceKey?: string;
  flowId: string;
  flowVersion: number;
  currentStepId: string;
  status: "active" | "completed" | "cancelled";
  revision: number;
  data: unknown;
  history: string[];
};

function toInstance(row: GuidedFlowRow): GuidedFlowInstance {
  return {
    instanceId: row.instanceId,
    ...(row.instanceKey ? { instanceKey: row.instanceKey } : {}),
    flowId: row.flowId,
    flowVersion: row.flowVersion,
    currentStepId: row.currentStepId,
    status: row.status,
    revision: row.revision,
    data:
      row.data && typeof row.data === "object" && !Array.isArray(row.data)
        ? (row.data as Record<string, unknown>)
        : {},
    history: row.history,
  };
}

/** Custom flows live in userState — the same source the guided-flows route uses. */
async function customGuidedFlowDefinition(
  client: ReturnType<typeof createBackendClient>,
  ctx: GuidedFlowToolContext,
  flowId: string,
): Promise<GuidedFlowDefinition | undefined> {
  const row = (await client.query(backendApi.userState.get, {
    tenantId: ctx.tenantId,
    namespace: GUIDED_FLOW_DEFINITIONS_NAMESPACE,
    userKey: ctx.actorId,
  })) as { data?: unknown } | null;
  return latestAvailableGuidedFlowDefinitions(
    parseStoredGuidedFlowDefinitions(row?.data),
  ).find((definition) => definition.id === flowId);
}

export function createGuidedFlowTools(ctx: GuidedFlowToolContext): ToolSet {
  const knownFlowIds = listGuidedFlowDefinitions()
    .map((definition) => definition.id)
    .join(", ");

  return {
    guided_flow_start: tool({
      description:
        "Start or resume a GuidedFlow for the user. Use only when the user " +
        "explicitly asks for step-by-step help with a supported task. " +
        `Built-in flow ids: ${knownFlowIds}. Custom flows defined in this ` +
        "repo can also be started by id. The result is the first interactive step.",
      inputSchema: z.object({
        flowId: z.string().trim().min(1).max(80),
        instanceKey: z.string().trim().min(1).max(128).optional(),
      }),
      execute: async ({
        flowId,
        instanceKey,
      }): Promise<RenderedViewDirective | { error: string }> => {
        const client = createBackendClient();
        const definition =
          getGuidedFlowDefinition(flowId) ??
          (await customGuidedFlowDefinition(client, ctx, flowId));
        if (!definition) return { error: `Unknown GuidedFlow "${flowId}"` };

        const active = (await client.query(backendApi.guidedFlows.listActive, {
          tenantId: ctx.tenantId,
          actorId: ctx.actorId,
        })) as GuidedFlowRow[];
        const existing = active.find(
          (row) =>
            row.flowId === flowId &&
            (row.instanceKey ?? "") === (instanceKey ?? ""),
        );
        if (existing)
          return buildGuidedFlowView(definition, toInstance(existing));

        const instance = createGuidedFlowInstance(
          definition,
          randomUUID(),
          instanceKey,
        );
        await client.mutation(backendApi.guidedFlows.upsert, {
          tenantId: ctx.tenantId,
          actorId: ctx.actorId,
          instanceId: instance.instanceId,
          instanceKey,
          flowId: instance.flowId,
          flowVersion: instance.flowVersion,
          currentStepId: instance.currentStepId,
          status: instance.status,
          revision: instance.revision,
          data: instance.data,
          history: [...instance.history],
          updatedAt: new Date().toISOString(),
        });
        return buildGuidedFlowView(definition, instance);
      },
    }),
  };
}

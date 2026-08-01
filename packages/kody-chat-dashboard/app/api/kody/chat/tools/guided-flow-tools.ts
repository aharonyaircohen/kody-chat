import { tool, type ToolSet } from "ai";
import { z } from "zod";

import { createBackendClient } from "@kody-ade/backend/client";
import {
  buildGuidedFlowView,
  listGuidedFlowDefinitions,
} from "@kody-ade/kody-chat-dashboard/guided-flows/registry";
import { loadGuidedFlowRenderers } from "../../guided-flows/catalog";
import { ConvexGuidedFlowReader } from "../../guided-flows/reader";
import { startOrResumeGuidedFlow } from "../../guided-flows/runtime-service";
import type { RenderedViewDirective } from "../../../../../src/dashboard/lib/chat-ui-actions";

interface GuidedFlowToolContext {
  tenantId: string;
  actorId: string;
  conversationId?: string;
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
        const selected = await startOrResumeGuidedFlow(client, {
          tenantId: ctx.tenantId,
          actorId: ctx.actorId,
          flowId,
          instanceKey,
          conversationId: ctx.conversationId,
        });
        if (!selected) return { error: `Unknown GuidedFlow "${flowId}"` };
        return buildGuidedFlowView(
          selected.definition,
          selected.instance,
          await loadGuidedFlowRenderers(ctx.tenantId, [selected.definition]),
        );
      },
    }),
    guided_flow_context: tool({
      description:
        "Read the exact GuidedFlow context bound to this conversation. " +
        "Call this with no arguments whenever the user asks about their " +
        "current flow, current step, or previous answers. Returns only the " +
        "current step and the 20 most recent submissions. This tool is read-only.",
      inputSchema: z.object({}),
      execute: async (): Promise<unknown> => {
        if (!ctx.conversationId) return { error: "no_conversation_context" };
        const reader = new ConvexGuidedFlowReader({
          tenantId: ctx.tenantId,
          actorId: ctx.actorId,
          conversationId: ctx.conversationId,
        });
        const current = await reader.getCurrent();
        if (!current) return { error: "no_guided_flow_bound" };
        return {
          current: {
            instance: {
              instanceId: current.instance.instanceId,
              flowId: current.instance.flowId,
              flowVersion: current.instance.flowVersion,
              currentStepId: current.instance.currentStepId,
              status: current.instance.status,
              revision: current.instance.revision,
            },
            currentStep: current.currentStep,
            path: current.path.map((frame) => ({
              flowId: frame.flowId,
              flowVersion: frame.flowVersion,
              currentStepId: frame.currentStepId,
            })),
          },
          recentHistory: await reader.getHistory({ limit: 20 }),
        };
      },
    }),
    guided_flow_read: tool({
      description:
        "Read the GuidedFlow bound to this conversation. Use this to inspect " +
        "the current step, the complete flow outline, collected data, or " +
        "paginated user submissions before answering questions about the flow. " +
        "This tool is read-only and cannot access an arbitrary instance.",
      inputSchema: z.object({
        section: z.enum(["current", "outline", "step", "data", "history"]),
        flowId: z.string().trim().min(1).max(80).optional(),
        flowVersion: z.number().int().positive().optional(),
        stepId: z.string().trim().min(1).max(80).optional(),
        keys: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
        beforeRevision: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async (input): Promise<unknown> => {
        if (!ctx.conversationId) return { error: "no_conversation_context" };
        const reader = new ConvexGuidedFlowReader({
          tenantId: ctx.tenantId,
          actorId: ctx.actorId,
          conversationId: ctx.conversationId,
        });
        const current = await reader.getCurrent();
        if (!current) return { error: "no_guided_flow_bound" };
        switch (input.section) {
          case "current":
            return {
              instance: {
                instanceId: current.instance.instanceId,
                flowId: current.instance.flowId,
                flowVersion: current.instance.flowVersion,
                currentStepId: current.instance.currentStepId,
                status: current.instance.status,
                revision: current.instance.revision,
              },
              currentStep: current.currentStep,
              path: current.path.map((frame) => ({
                flowId: frame.flowId,
                flowVersion: frame.flowVersion,
                currentStepId: frame.currentStepId,
              })),
            };
          case "outline":
            return { definitions: await reader.getOutline() };
          case "step": {
            if (!input.flowId || !input.flowVersion || !input.stepId) {
              return {
                error:
                  "flowId, flowVersion, and stepId are required for section=step",
              };
            }
            const step = await reader.getStep({
              flowId: input.flowId,
              flowVersion: input.flowVersion,
              stepId: input.stepId,
            });
            return step ?? { error: "guided_flow_step_not_found" };
          }
          case "data":
            return { data: await reader.getData(input.keys) };
          case "history":
            return await reader.getHistory(input);
        }
      },
    }),
  };
}

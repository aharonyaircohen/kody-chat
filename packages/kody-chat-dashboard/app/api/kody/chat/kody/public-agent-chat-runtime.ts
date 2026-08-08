import { generateText, type ToolSet } from "ai";

import {
  buildPublicAgentChildSystem,
  buildPublicAgentReference,
  requiresPublicAgentToolEvidence,
  runIsolatedPublicAgentTaskWithRetry,
  synthesizePublicAgentResponse,
} from "./public-agent-delegation";
import type { PublicDelegationAgent } from "./public-agent-definition";
import {
  handlePublicAgentChat,
  type PublicAgentChatResult,
} from "./public-agent-chat-handler";
import {
  orchestratePublicAgentTurn,
  type PublicAgentCapability,
} from "./public-agent-orchestrator";
import { routePublicAgentTask } from "./public-agent-routing";

interface PublicAgentTelemetry {
  traceId: string;
  startedAt: number;
  formatError(error: unknown): string;
  clearContext(): void;
  log(data: object, message: string): void;
  warn(data: object, message: string): void;
  error(data: object, message: string): void;
}

interface HandleConfiguredPublicAgentChatOptions {
  userText: string;
  assignedAgents: readonly PublicDelegationAgent[];
  model: Parameters<typeof generateText>[0]["model"];
  availableTools: Record<string, unknown>;
  specialistTools: Record<string, unknown>;
  outputToolNames: readonly string[];
  loadCapabilities(
    agent: PublicDelegationAgent,
  ): Promise<PublicAgentCapability[]>;
  wrapTool(name: string, candidate: unknown): unknown;
  repository?: { owner: string; repo: string } | null;
  maxSteps: number;
  providerCapabilities: { supportsRequiredToolChoice: boolean };
  startDurableTurn?: () => {
    complete(text: string): Promise<void>;
    fail(errorCode: string): Promise<void>;
  };
  telemetry: PublicAgentTelemetry;
}

/** Adapts configured Agents, Capabilities, and tools to the specialist chat protocol. */
export async function handleConfiguredPublicAgentChat({
  userText,
  assignedAgents,
  model,
  availableTools,
  specialistTools,
  outputToolNames,
  loadCapabilities,
  wrapTool,
  repository,
  maxSteps,
  providerCapabilities,
  startDurableTurn,
  telemetry,
}: HandleConfiguredPublicAgentChatOptions): Promise<PublicAgentChatResult> {
  const { traceId } = telemetry;
  return handlePublicAgentChat({
    traceId,
    assignedAgents,
    route: () => routePublicAgentTask({ userText, assignedAgents, model }),
    orchestrate: (decision, onReasoningDelta) =>
      orchestratePublicAgentTurn({
        userText,
        assignedAgents,
        availableTools,
        specialistTools,
        outputToolNames,
        loadCapabilities,
        route: async () => decision,
        invoke: async ({ agent, task, capabilities, tools }) => {
          const wrappedTools = Object.fromEntries(
            Object.entries(tools).map(([name, candidate]) => [
              name,
              wrapTool(name, candidate),
            ]),
          );
          const capabilityInstructions = capabilities.map(
            (capability) => capability.instructions,
          );
          return runIsolatedPublicAgentTaskWithRetry({
            agent,
            task,
            reference: buildPublicAgentReference({
              agent,
              capabilityInstructions,
              capabilityToolNames: capabilities.flatMap((capability) =>
                capability.capabilityTools.map((tool) => tool.name),
              ),
            }),
            system: buildPublicAgentChildSystem({
              agent,
              capabilityInstructions,
              repository,
            }),
            model,
            tools: wrappedTools as ToolSet,
            maxSteps,
            requireToolEvidence: requiresPublicAgentToolEvidence(task),
            providerCapabilities,
            onReasoningDelta: (delta) =>
              onReasoningDelta({ agent: agent.slug, delta }),
          });
        },
      }),
    synthesize: (decision, results) =>
      synthesizePublicAgentResponse({
        userText,
        assignments: decision.assignments,
        assignedAgents,
        results,
        model,
      }),
    startDurableTurn,
    formatStreamError: (error) =>
      `[trace ${traceId}] ${telemetry.formatError(error)}`,
    onDurableStartFailure: (error) =>
      telemetry.error(
        { traceId, err: telemetry.formatError(error) },
        "kody-direct: durable specialist turn setup failed",
      ),
    onDurableCompleteFailure: (error) =>
      telemetry.error(
        { traceId, err: telemetry.formatError(error) },
        "kody-direct: durable specialist completion failed",
      ),
    onDurableFailFailure: (error) =>
      telemetry.error(
        { traceId, err: telemetry.formatError(error) },
        "kody-direct: durable specialist failure write failed",
      ),
    onOrchestrationComplete: (decision, childSessionIds) =>
      telemetry.log(
        {
          traceId,
          mode: decision.mode,
          agents:
            decision.mode === "delegate"
              ? decision.assignments.map((assignment) => assignment.agent)
              : [],
          childSessions: childSessionIds,
        },
        "kody-direct: specialist routing completed",
      ),
    onOrchestrationFailure: (error) =>
      telemetry.error(
        { traceId, err: telemetry.formatError(error) },
        "kody-direct: specialist orchestration failed",
      ),
    onSpecialistFailure: (result) =>
      telemetry.warn(
        {
          traceId,
          agent: result.agent,
          childSession: result.sessionId,
          failureCode: result.failure.code,
          err: result.failure.detail,
        },
        "kody-direct: specialist task failed",
      ),
    onSynthesisFailure: (error) =>
      telemetry.error(
        { traceId, err: telemetry.formatError(error) },
        "kody-direct: specialist synthesis failed",
      ),
    onFinished: (outcome) => {
      telemetry.clearContext();
      telemetry.log(
        { traceId, totalDuration: Date.now() - telemetry.startedAt },
        outcome.returnedFailure
          ? "kody-direct: specialist failure returned"
          : "kody-direct: synthesized specialist result",
      );
    },
    onStreamError: (error) => {
      telemetry.clearContext();
      telemetry.error(
        { traceId, err: telemetry.formatError(error) },
        "kody-direct: specialist stream failed",
      );
    },
  });
}

import {
  formatPublicAgentFailure,
  PUBLIC_AGENT_SYNTHESIS_FAILURE_MESSAGE,
  type PublicAgentTaskResult,
} from "./public-agent-delegation";
import type { PublicAgentAssignment } from "./public-agent-routing";
type FailedPublicAgentTaskResult = Extract<
  PublicAgentTaskResult,
  { status: "failed" }
>;

export interface PublicAgentActivity {
  id: string;
  assignment: PublicAgentAssignment;
  title: string;
}

type PublicAgentStreamEvent =
  | {
      type: "data-subagent-activity";
      data: {
        id: string;
        phase: "started" | "reasoning" | "completed" | "failed";
        agentTitle: string;
        task?: string;
        reasoning?: string;
        reasoningDelta?: string;
        errorText?: string;
      };
    }
  | { type: "text-start" | "text-end"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | {
      type: "tool-input-available";
      toolCallId: string;
      toolName: string;
      input: unknown;
    }
  | {
      type: "tool-output-available";
      toolCallId: string;
      output: unknown;
    }
  | { type: "data-chat-output-contract"; data: { mode: "exclusive-tool" } };

export interface PublicAgentResponseWriter {
  write(event: PublicAgentStreamEvent): void;
}

interface PublicAgentDurableTurn {
  complete(text: string): Promise<void>;
  fail(errorCode: string): Promise<void>;
}

interface WritePublicAgentResponseOptions {
  writer: PublicAgentResponseWriter;
  traceId: string;
  messageId: string;
  activities: readonly PublicAgentActivity[];
  runOrchestration(
    onReasoningDelta: (event: { agent: string; delta: string }) => void,
  ): Promise<{
    parentTools: Record<string, unknown>;
    results: PublicAgentTaskResult[];
  }>;
  present?: (
    results: readonly PublicAgentTaskResult[],
    parentTools: Record<string, unknown>,
    writer: PublicAgentResponseWriter,
  ) => Promise<string>;
  synthesize(results: readonly PublicAgentTaskResult[]): Promise<string>;
  startDurableTurn?: () => PublicAgentDurableTurn;
  onDurableStartFailure?: (error: unknown) => void;
  onDurableCompleteFailure?: (error: unknown) => void;
  onDurableFailFailure?: (error: unknown) => void;
  onOrchestrationComplete?: (childSessionIds: readonly string[]) => void;
  onOrchestrationFailure?: (error: unknown) => void;
  onSpecialistFailure?: (result: FailedPublicAgentTaskResult) => void;
  onSynthesisFailure?: (error: unknown) => void;
}

export interface PublicAgentResponseOutcome {
  text: string;
  allSpecialistsFailed: boolean;
  returnedFailure: boolean;
  childSessionIds: string[];
}

export async function writePublicAgentResponse({
  writer,
  traceId,
  messageId,
  activities,
  runOrchestration,
  present,
  synthesize,
  startDurableTurn,
  onDurableStartFailure,
  onDurableCompleteFailure,
  onDurableFailFailure,
  onOrchestrationComplete,
  onOrchestrationFailure,
  onSpecialistFailure,
  onSynthesisFailure,
}: WritePublicAgentResponseOptions): Promise<PublicAgentResponseOutcome> {
  const streamedReasoningAgents = new Set<string>();
  let durableTurn: PublicAgentDurableTurn | null = null;
  if (startDurableTurn) {
    try {
      durableTurn = startDurableTurn();
    } catch (error) {
      onDurableStartFailure?.(error);
    }
  }

  for (const activity of activities) {
    writer.write({
      type: "data-subagent-activity",
      data: {
        id: activity.id,
        phase: "started",
        agentTitle: activity.title,
        task: activity.assignment.task,
      },
    });
  }

  const activitiesByAgent = new Map(
    activities.map(
      (activity) => [activity.assignment.agent, activity] as const,
    ),
  );
  let orchestration: {
    parentTools: Record<string, unknown>;
    results: PublicAgentTaskResult[];
  };
  try {
    orchestration = await runOrchestration(({ agent, delta }) => {
      const activity = activitiesByAgent.get(agent);
      if (!activity || !delta) return;
      streamedReasoningAgents.add(agent);
      writer.write({
        type: "data-subagent-activity",
        data: {
          id: activity.id,
          phase: "reasoning",
          agentTitle: activity.title,
          reasoningDelta: delta,
        },
      });
    });
  } catch (error) {
    onOrchestrationFailure?.(error);
    const detail = error instanceof Error ? error.message : String(error);
    orchestration = {
      parentTools: {},
      results: activities.map((activity) => ({
        status: "failed",
        agent: activity.assignment.agent,
        failure: { code: "orchestration_error", detail },
      })),
    };
  }
  const childSessionIds = orchestration.results.flatMap((result) =>
    result.sessionId ? [result.sessionId] : [],
  );
  onOrchestrationComplete?.(childSessionIds);
  const resultsByAgent = new Map<string, PublicAgentTaskResult[]>();
  for (const result of orchestration.results) {
    const matchingResults = resultsByAgent.get(result.agent) ?? [];
    resultsByAgent.set(result.agent, [...matchingResults, result]);
  }
  const results = activities.map((activity): PublicAgentTaskResult => {
    const matchingResults = resultsByAgent.get(activity.assignment.agent) ?? [];
    if (matchingResults.length === 1) return matchingResults[0]!;
    return {
      status: "failed",
      agent: activity.assignment.agent,
      failure: {
        code: "missing_result",
        detail:
          matchingResults.length === 0
            ? "No result was returned for the delegated assignment."
            : "Multiple results were returned for one delegated assignment.",
      },
    };
  });
  const failures = results.filter(
    (result): result is FailedPublicAgentTaskResult =>
      result.status === "failed",
  );
  const failureMessagesByAgent = new Map(
    failures.map((result) => {
      onSpecialistFailure?.(result);
      return [
        result.agent,
        `${formatPublicAgentFailure(result.failure.code)} (trace ${traceId})`,
      ] as const;
    }),
  );

  for (const activity of activities) {
    const result = results.find(
      (candidate) => candidate.agent === activity.assignment.agent,
    );
    const failed = result?.status === "failed";
    writer.write({
      type: "data-subagent-activity",
      data: {
        id: activity.id,
        phase: failed ? "failed" : "completed",
        agentTitle: activity.title,
        ...(result?.reasoning &&
        !streamedReasoningAgents.has(activity.assignment.agent)
          ? { reasoning: result.reasoning }
          : {}),
        ...(failed
          ? { errorText: failureMessagesByAgent.get(activity.assignment.agent) }
          : {}),
      },
    });
  }

  const allSpecialistsFailed =
    results.length > 0 && failures.length === results.length;
  const canRecoverEmptyResults =
    allSpecialistsFailed &&
    failures.every(
      (result) =>
        result.failure.code === "empty_result" &&
        Boolean(result.reference?.trim() || result.evidence?.trim()),
    );
  const returnedFailure = allSpecialistsFailed && !canRecoverEmptyResults;

  let text: string;
  let presentationWritten = false;
  if (returnedFailure) {
    text = activities
      .map(
        (activity) =>
          `${activity.title} failed: ${failureMessagesByAgent.get(activity.assignment.agent) ?? `The specialist model request failed. Retry or choose another model. (trace ${traceId})`}`,
      )
      .join("\n\n");
  } else {
    if (present) {
      try {
        text = await present(results, orchestration.parentTools, writer);
        presentationWritten = true;
      } catch (error) {
        onSynthesisFailure?.(error);
        try {
          text = await synthesize(results);
        } catch (synthesisError) {
          onSynthesisFailure?.(synthesisError);
          text = PUBLIC_AGENT_SYNTHESIS_FAILURE_MESSAGE;
        }
      }
    } else {
      try {
        text = await synthesize(results);
      } catch (error) {
        onSynthesisFailure?.(error);
        text = PUBLIC_AGENT_SYNTHESIS_FAILURE_MESSAGE;
      }
    }
  }

  if (!presentationWritten) {
    writer.write({ type: "text-start", id: messageId });
    writer.write({ type: "text-delta", id: messageId, delta: text });
    writer.write({ type: "text-end", id: messageId });
  }
  if (durableTurn) {
    try {
      if (returnedFailure) {
        const errorCode = failures.some(
          (result) => result.failure.code === "orchestration_error",
        )
          ? "specialist_orchestration_failed"
          : "specialist_failed";
        await durableTurn.fail(errorCode);
      } else {
        await durableTurn.complete(text);
      }
    } catch (error) {
      if (returnedFailure) onDurableFailFailure?.(error);
      else onDurableCompleteFailure?.(error);
    }
  }

  return {
    text,
    allSpecialistsFailed,
    returnedFailure,
    childSessionIds,
  };
}

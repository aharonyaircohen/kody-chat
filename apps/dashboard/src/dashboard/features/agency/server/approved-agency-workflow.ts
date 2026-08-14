import { randomUUID } from "node:crypto";

import type { AgencyRequestExecution } from "@kody-ade/agency-domain";
import {
  startWorkflow,
  type WorkflowExecutionDependencies,
} from "@dashboard/features/workflows/server/start-workflow";

type DispatchServices = Pick<
  WorkflowExecutionDependencies,
  "loadWorkflow" | "validateDefinition" | "validateInput" | "dispatch"
> & {
  activate?(
    activation: NonNullable<AgencyRequestExecution["activations"]>[number],
  ): Promise<{ configPatch?: Record<string, unknown> }>;
};

function mergeConfigPatch(
  current: Record<string, unknown>,
  incoming: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!incoming) return current;
  const next = { ...current };
  for (const [key, value] of Object.entries(incoming)) {
    const previous = next[key];
    next[key] =
      Array.isArray(previous) && Array.isArray(value)
        ? [...new Set([...previous, ...value])]
        : value;
  }
  return next;
}

export async function dispatchApprovedAgencyWorkflow({
  actor,
  execution,
  runId,
  services,
}: {
  actor: string;
  execution: AgencyRequestExecution;
  runId: string;
  services: DispatchServices;
}): Promise<{ runId: string }> {
  let configPatch: Record<string, unknown> = {};
  for (const activation of execution.activations ?? []) {
    if (!services.activate) {
      throw new Error("The approved Agency activation service is unavailable");
    }
    const result = await services.activate(activation);
    configPatch = mergeConfigPatch(configPatch, result.configPatch);
  }
  const input =
    Object.keys(configPatch).length > 0
      ? { ...execution.input, installation: { configPatch } }
      : { ...execution.input };
  const result = await startWorkflow(
    {
      workflowId: execution.workflowId,
      source: "dashboard",
      actor,
      requestId: runId,
      input,
    },
    {
      ...services,
      createRequestId: () => `run-${randomUUID()}`,
      now: () => new Date().toISOString(),
      // The user approved the exact Workflow and validated input stored on the
      // Agency request. That approval is the authorization for this dispatch.
      requiresApproval: async () => false,
      consumeApproval: async () => false,
      actionFor: () => "run",
    },
  );
  if (result.kind === "accepted") return { runId: result.requestId };
  if (result.kind === "not-found") {
    throw new Error("The approved Workflow is no longer available");
  }
  if (result.kind === "invalid") {
    throw new Error("The approved Workflow or its input is no longer valid");
  }
  throw new Error("The approved Workflow could not be dispatched");
}

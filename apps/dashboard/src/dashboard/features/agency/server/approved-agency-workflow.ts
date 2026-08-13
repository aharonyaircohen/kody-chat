import { randomUUID } from "node:crypto";

import type { AgencyRequestExecution } from "@kody-ade/agency-domain";
import {
  startWorkflow,
  type WorkflowExecutionDependencies,
} from "@dashboard/features/workflows/server/start-workflow";

type DispatchServices = Pick<
  WorkflowExecutionDependencies,
  "loadWorkflow" | "validateDefinition" | "validateInput" | "dispatch"
>;

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
  const result = await startWorkflow(
    {
      workflowId: execution.workflowId,
      source: "dashboard",
      actor,
      requestId: runId,
      input: { ...execution.input },
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

import type {
  EngineExecutionReceipt,
  EngineExecutionRequest,
  EngineExecutionSource,
} from "@kody-ade/engine-contracts";
import type {
  WorkflowDefinition,
  WorkflowValidationIssue,
} from "@dashboard/lib/workflow-definitions";

export interface WorkflowExecutionDependencies {
  createRequestId(): string;
  loadWorkflow(
    workflowId: string,
  ): Promise<{ workflow: WorkflowDefinition } | null>;
  validateWorkflow(workflow: WorkflowDefinition): WorkflowValidationIssue[];
  authorize(
    workflowId: string,
    workflow: WorkflowDefinition,
    explicitlyApproved: boolean,
  ): Promise<boolean>;
  dispatch(request: EngineExecutionRequest): Promise<EngineExecutionReceipt>;
}

export interface StartWorkflowCommand {
  workflowId: string;
  source: EngineExecutionSource;
  requestId?: string;
  approved?: boolean;
}

export type StartWorkflowResult =
  | {
      kind: "accepted";
      workflowId: string;
      requestId: string;
      acceptedAt: string;
    }
  | { kind: "not-found" }
  | { kind: "approval-required" }
  | { kind: "invalid"; issues: WorkflowValidationIssue[] };

export async function startWorkflow(
  command: StartWorkflowCommand,
  dependencies: WorkflowExecutionDependencies,
): Promise<StartWorkflowResult> {
  const loaded = await dependencies.loadWorkflow(command.workflowId);
  if (!loaded) return { kind: "not-found" };

  const issues = dependencies.validateWorkflow(loaded.workflow);
  if (issues.length > 0) return { kind: "invalid", issues };
  const authorized = await dependencies.authorize(
    command.workflowId,
    loaded.workflow,
    command.approved === true,
  );
  if (!authorized) return { kind: "approval-required" };

  const requestId = command.requestId ?? dependencies.createRequestId();
  const receipt = await dependencies.dispatch({
    requestId,
    target: { type: "workflow", id: command.workflowId },
    intent: "run",
    source: command.source,
  });

  return {
    kind: "accepted",
    workflowId: command.workflowId,
    requestId: receipt.requestId,
    acceptedAt: receipt.acceptedAt,
  };
}

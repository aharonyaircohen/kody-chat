import type { WorkflowDefinition } from "@dashboard/lib/workflow-definitions";
import type { LoopDefinition } from "@kody-ade/agency-domain";
import { readTrust } from "@dashboard/lib/cto/trust-store";
import {
  trustLevelForSubject,
  trustSubjectKey,
} from "@dashboard/lib/cto/trust-state";

export async function workflowRequiresApproval(
  workflowId: string,
  workflow: WorkflowDefinition,
): Promise<boolean> {
  const trust = await readTrust();
  const subject = trustSubjectKey("workflow", workflowId);
  const level = trustLevelForSubject(
    trust.subjects[subject],
    workflow.runWithoutApproval === true,
  );
  return level === "approval-required";
}

export async function authorizeLoopExecution(
  loopId: string,
  _loop: LoopDefinition,
  explicitlyApproved: boolean,
): Promise<boolean> {
  const trust = await readTrust();
  const subject = trustSubjectKey("loop", loopId);
  const level = trustLevelForSubject(trust.subjects[subject], false);
  return level !== "approval-required" || explicitlyApproved;
}

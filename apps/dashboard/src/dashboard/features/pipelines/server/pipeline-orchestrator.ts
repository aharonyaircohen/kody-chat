import "server-only";
import { createHash } from "node:crypto";
import type { Octokit } from "@octokit/rest";
import { api } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import { logger } from "@kody-ade/base/logger";
import {
  resolvePipelineStepInput,
  type PipelineDefinition,
  type PipelineStepDefinition,
} from "@dashboard/lib/pipeline-definitions";
import {
  validateWorkflowDefinition,
  validateWorkflowInput,
} from "@dashboard/lib/workflow-definitions";
import { createCompanyWorkflowLoader } from "@dashboard/features/workflows/server/company-workflow-loader";
import { createGitHubActionsEngineGateway } from "@dashboard/features/workflows/server/github-actions-engine-gateway";
import { startWorkflow } from "@dashboard/features/workflows/server/start-workflow";

function childRunId(pipelineRunId: string, stepId: string): string {
  const digest = createHash("sha256")
    .update(`${pipelineRunId}:${stepId}`)
    .digest("hex")
    .slice(0, 40);
  return `run-pipeline-${digest}`;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function startPipelineExecution(input: {
  octokit: Octokit;
  owner: string;
  repo: string;
  pipelineId: string;
  pipelineRunId: string;
  pipeline: PipelineDefinition;
  pipelineInput: Record<string, unknown>;
}): Promise<{ claimed: boolean; acceptedAt: string }> {
  const acceptedAt = new Date().toISOString();
  const reservation = await createBackendClient().mutation(
    api.pipelineRuns.reserve,
    {
      tenantId: `${input.owner}/${input.repo}`,
      pipelineId: input.pipelineId,
      runId: input.pipelineRunId,
      input: input.pipelineInput,
      steps: input.pipeline.steps.map((step) => ({
        id: step.id,
        workflowId: step.workflow,
        ...(step.inputMap ? { inputMap: step.inputMap } : {}),
        status: "pending" as const,
      })),
      now: acceptedAt,
    },
  );
  if (!reservation.claimed) {
    return {
      claimed: false,
      acceptedAt: reservation.run?.updatedAt ?? acceptedAt,
    };
  }
  try {
    await dispatchPipelineStep({
      octokit: input.octokit,
      owner: input.owner,
      repo: input.repo,
      pipelineId: input.pipelineId,
      pipelineRunId: input.pipelineRunId,
      stepIndex: 0,
      step: input.pipeline.steps[0]!,
      pipelineInput: input.pipelineInput,
    });
  } catch (error) {
    await failPipelineDispatch({
      owner: input.owner,
      repo: input.repo,
      pipelineId: input.pipelineId,
      pipelineRunId: input.pipelineRunId,
      error,
    });
    throw error;
  }
  return { claimed: true, acceptedAt };
}

export async function dispatchPipelineStep(input: {
  octokit: Octokit;
  owner: string;
  repo: string;
  pipelineId: string;
  pipelineRunId: string;
  stepIndex: number;
  step: PipelineStepDefinition;
  pipelineInput: Record<string, unknown>;
  previousOutput?: Record<string, unknown>;
}): Promise<{ workflowRunId: string }> {
  const workflowRunId = childRunId(input.pipelineRunId, input.step.id);
  const workflowInput = resolvePipelineStepInput({
    step: input.step,
    pipelineInput: input.pipelineInput,
    previousOutput: input.previousOutput,
  });
  const result = await startWorkflow(
    {
      workflowId: input.step.workflow,
      source: "dashboard",
      actor: `pipeline:${input.pipelineId}`,
      requestId: workflowRunId,
      input: workflowInput,
    },
    {
      createRequestId: () => workflowRunId,
      now: () => new Date().toISOString(),
      loadWorkflow: createCompanyWorkflowLoader({
        octokit: input.octokit,
        owner: input.owner,
        repo: input.repo,
      }),
      validateDefinition: validateWorkflowDefinition,
      validateInput: (schema, value) => validateWorkflowInput(value, schema),
      // The Pipeline approval is the authority for its declared child runs.
      requiresApproval: async () => false,
      consumeApproval: async () => true,
      actionFor: () => `pipeline:${input.pipelineId}`,
      dispatch: createGitHubActionsEngineGateway({
        octokit: input.octokit,
        owner: input.owner,
        repo: input.repo,
      }),
    },
  );
  if (result.kind !== "accepted") {
    const detail =
      result.kind === "invalid"
        ? result.issues.map((issue) => issue.message).join("; ")
        : result.kind;
    throw new Error(
      `Pipeline Workflow ${input.step.workflow} was not started: ${detail}`,
    );
  }
  await createBackendClient().mutation(api.pipelineRuns.markDispatched, {
    tenantId: `${input.owner}/${input.repo}`,
    pipelineId: input.pipelineId,
    runId: input.pipelineRunId,
    stepIndex: input.stepIndex,
    workflowRunId,
    now: new Date().toISOString(),
  });
  return { workflowRunId };
}

export async function failPipelineDispatch(input: {
  owner: string;
  repo: string;
  pipelineId: string;
  pipelineRunId: string;
  error: unknown;
}): Promise<void> {
  await createBackendClient().mutation(api.pipelineRuns.failDispatch, {
    tenantId: `${input.owner}/${input.repo}`,
    pipelineId: input.pipelineId,
    runId: input.pipelineRunId,
    error: message(input.error),
    now: new Date().toISOString(),
  });
}

export async function advancePipelineForWorkflowCompletion(input: {
  octokit: Octokit;
  owner: string;
  repo: string;
  workflowRunId: string;
  status: "success" | "failed" | "blocked";
  output: Record<string, unknown>;
}): Promise<boolean> {
  const next = await createBackendClient().mutation(api.pipelineRuns.advance, {
    tenantId: `${input.owner}/${input.repo}`,
    workflowRunId: input.workflowRunId,
    status: input.status,
    output: input.output,
    now: new Date().toISOString(),
  });
  if (!next) return false;
  if (next.kind !== "next") return true;
  const step: PipelineStepDefinition = {
    id: next.step.id,
    workflow: next.step.workflowId,
    ...(next.step.inputMap ? { inputMap: next.step.inputMap } : {}),
  };
  try {
    await dispatchPipelineStep({
      octokit: input.octokit,
      owner: input.owner,
      repo: input.repo,
      pipelineId: next.pipelineId,
      pipelineRunId: next.runId,
      stepIndex: next.stepIndex,
      step,
      pipelineInput: next.input,
      previousOutput: next.previousOutput,
    });
  } catch (error) {
    await failPipelineDispatch({
      owner: input.owner,
      repo: input.repo,
      pipelineId: next.pipelineId,
      pipelineRunId: next.runId,
      error,
    });
    logger.error(
      { pipeline: next.pipelineId, runId: next.runId, error: message(error) },
      "Pipeline failed to start its next Workflow",
    );
  }
  return true;
}

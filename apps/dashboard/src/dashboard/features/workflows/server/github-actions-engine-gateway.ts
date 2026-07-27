import type {
  EngineExecutionReceipt,
  EngineExecutionRequest,
} from "@kody-ade/engine-contracts";
import { buildKodyWorkflowDispatchInputs } from "@dashboard/lib/kody-workflow-dispatch";

interface GitHubActionsClient {
  rest: {
    repos: {
      get(input: {
        owner: string;
        repo: string;
      }): Promise<{ data: { default_branch?: string | null } }>;
      getContent?(input: {
        owner: string;
        repo: string;
        path: string;
        ref?: string;
      }): Promise<{ data: unknown }>;
    };
    actions: {
      createWorkflowDispatch(input: {
        owner: string;
        repo: string;
        workflow_id: string;
        ref: string;
        inputs: Record<string, string>;
      }): Promise<unknown>;
    };
  };
}

interface GitHubActionsEngineGatewayOptions {
  octokit: GitHubActionsClient;
  owner: string;
  repo: string;
  now?: () => Date;
}

export function createGitHubActionsEngineGateway({
  octokit,
  owner,
  repo,
  now = () => new Date(),
}: GitHubActionsEngineGatewayOptions) {
  return async function dispatch(
    request: EngineExecutionRequest,
  ): Promise<EngineExecutionReceipt> {
    const repository = await octokit.rest.repos.get({ owner, repo });
    const ref = repository.data.default_branch || "main";
    const inputs = await buildKodyWorkflowDispatchInputs(octokit, {
      owner,
      repo,
      ref,
      executionRequest: request,
    });
    await octokit.rest.actions.createWorkflowDispatch({
      owner,
      repo,
      workflow_id: "kody.yml",
      ref,
      inputs,
    });
    return { requestId: request.requestId, acceptedAt: now().toISOString() };
  };
}

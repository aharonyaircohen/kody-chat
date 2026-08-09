import type { Octokit } from "@octokit/rest";
import { getEngineConfig } from "@kody-ade/base/engine/config";
import {
  readCompanyStoreWorkflowDefinitionFile,
  readWorkflowDefinitionFile,
} from "@dashboard/lib/workflow-definition-files";
import type { WorkflowDefinition } from "@dashboard/lib/workflow-definitions";
import { effectiveActiveWorkflowIds } from "@dashboard/features/workflows/built-in-workflows";

interface CompanyWorkflowLoaderOptions {
  octokit: Octokit;
  owner: string;
  repo: string;
}

export function createCompanyWorkflowLoader({
  octokit,
  owner,
  repo,
}: CompanyWorkflowLoaderOptions) {
  return async function loadWorkflow(
    workflowId: string,
  ): Promise<{ workflow: WorkflowDefinition } | null> {
    const local = await readWorkflowDefinitionFile(workflowId, owner, repo);
    if (local) return local;

    // Webhook bursts must reuse the normal 60s config cache. A forced GitHub
    // read here would spend one API request per matching event.
    const { config } = await getEngineConfig(octokit, owner, repo);
    if (
      !effectiveActiveWorkflowIds(config.company?.activeWorkflows).has(
        workflowId,
      )
    ) {
      return null;
    }
    return readCompanyStoreWorkflowDefinitionFile(workflowId, octokit);
  };
}

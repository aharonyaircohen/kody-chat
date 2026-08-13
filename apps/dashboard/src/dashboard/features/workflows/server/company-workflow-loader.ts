import type { Octokit } from "@octokit/rest";
import { getEngineConfig } from "@kody-ade/base/engine/config";
import {
  readCompanyStoreWorkflowDefinitionFile,
  readWorkflowDefinitionFile,
} from "@dashboard/lib/workflow-definition-files";
import type { WorkflowDefinition } from "@dashboard/lib/workflow-definitions";
import { effectiveActiveWorkflowIds } from "@dashboard/features/workflows/built-in-workflows";
import { syncStoreWorkflowExecutionDefinitions } from "@dashboard/lib/store-workflow-execution-sync";

interface CompanyWorkflowLoaderOptions {
  octokit: Octokit;
  owner: string;
  repo: string;
  syncStoreDefinitions?: boolean;
}

export function createCompanyWorkflowLoader({
  octokit,
  owner,
  repo,
  syncStoreDefinitions = false,
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
    const store = await readCompanyStoreWorkflowDefinitionFile(
      workflowId,
      octokit,
    );
    if (store && syncStoreDefinitions) {
      await syncStoreWorkflowExecutionDefinitions({
        octokit,
        owner,
        repo,
        workflow: store.workflow,
      });
    }
    return store;
  };
}

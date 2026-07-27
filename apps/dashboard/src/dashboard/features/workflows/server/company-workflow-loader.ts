import type { Octokit } from "@octokit/rest";
import { getEngineConfig } from "@kody-ade/base/engine/config";
import {
  readCompanyStoreWorkflowDefinitionFile,
  readWorkflowDefinitionFile,
} from "@dashboard/lib/workflow-definition-files";
import type { WorkflowDefinition } from "@dashboard/lib/workflow-definitions";

interface CompanyWorkflowLoaderOptions {
  octokit: Octokit;
  owner: string;
  repo: string;
}

function activeWorkflowIds(values: string[] | undefined): Set<string> {
  return new Set(
    (values ?? []).filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    ),
  );
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

    const { config } = await getEngineConfig(octokit, owner, repo, {
      force: true,
    });
    if (!activeWorkflowIds(config.company?.activeWorkflows).has(workflowId)) {
      return null;
    }
    return readCompanyStoreWorkflowDefinitionFile(workflowId, octokit);
  };
}

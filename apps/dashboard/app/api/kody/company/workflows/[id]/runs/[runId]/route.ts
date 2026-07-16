import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth, getUserOctokit, requireKodyAuth } from "@kody-ade/base/auth";
import { clearGitHubContext, setGitHubContext } from "@dashboard/lib/github-client";
import { isWorkflowDefinitionId } from "@dashboard/lib/workflow-definitions";
import { readWorkflowRunStateFile } from "@dashboard/lib/workflow-run-state-files";
import { stopWorkflowRunner } from "@dashboard/lib/workflow-runner-control";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;
  const auth = getRequestAuth(req);
  if (!auth) return NextResponse.json({ error: "no_repo_context" }, { status: 400 });
  const { id, runId } = await params;
  if (!isWorkflowDefinitionId(id) || !/^run-[a-z0-9]+$/.test(runId)) {
    return NextResponse.json({ error: "invalid_workflow_run" }, { status: 400 });
  }
  let action: unknown;
  try { action = (await req.json()).action; } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (action !== "stop") return NextResponse.json({ error: "unsupported_action" }, { status: 400 });
  setGitHubContext(auth.owner, auth.repo, auth.token, auth.storeRepoUrl, auth.storeRef);
  try {
    const octokit = await getUserOctokit(req);
    if (!octokit) return NextResponse.json({ error: "no_user_token" }, { status: 401 });
    const run = await readWorkflowRunStateFile(auth.owner, auth.repo, id, runId);
    if (!run) return NextResponse.json({ error: "run_not_found" }, { status: 404 });
    if (run.state.status !== "running") return NextResponse.json({ error: "run_not_active" }, { status: 409 });
    if (!run.runner || run.runner.kind !== "fly") {
      return NextResponse.json({ error: "runner_not_cancellable", message: "This run is using a shared runner." }, { status: 409 });
    }
    await stopWorkflowRunner(req, run.runner.machineId);
    return NextResponse.json({ ok: true, action: "stop", runId });
  } catch (error) {
    return NextResponse.json({ error: "failed_to_stop_workflow", message: error instanceof Error ? error.message : String(error) }, { status: 500 });
  } finally { clearGitHubContext(); }
}

import { API_BASE, buildHeaders, handleResponse } from "./client";

export async function stopWorkflowRun(workflowId: string, runId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/company/workflows/${encodeURIComponent(workflowId)}/runs/${encodeURIComponent(runId)}`, {
    method: "POST", headers: buildHeaders(), body: JSON.stringify({ action: "stop" }),
  });
  await handleResponse(res);
}

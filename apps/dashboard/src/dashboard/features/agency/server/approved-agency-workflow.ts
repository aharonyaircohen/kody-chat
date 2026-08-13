import type { AgencyRequestExecution } from "@kody-ade/agency-domain";

interface RequestContext {
  url: string;
  headers: Headers;
}

type JsonRecord = Record<string, unknown>;

async function post(
  request: RequestContext,
  path: string,
  body: JsonRecord,
  fetchImpl: typeof fetch,
): Promise<{ response: Response; payload: JsonRecord }> {
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  const response = await fetchImpl(new URL(path, request.url), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return {
    response,
    payload: (await response.json().catch(() => ({}))) as JsonRecord,
  };
}

function runId(payload: JsonRecord): string | null {
  return typeof payload.runId === "string" && payload.runId.trim()
    ? payload.runId
    : null;
}

function dispatchError(response: Response, payload: JsonRecord): Error {
  const safeMessage =
    response.status < 500 && typeof payload.message === "string"
      ? payload.message
      : "Workflow dispatch failed";
  return new Error(safeMessage);
}

export async function dispatchApprovedAgencyWorkflow({
  request,
  execution,
  fetchImpl = fetch,
}: {
  request: RequestContext;
  execution: AgencyRequestExecution;
  fetchImpl?: typeof fetch;
}): Promise<{ runId: string }> {
  const runPath = `/api/kody/company/workflows/${encodeURIComponent(execution.workflowId)}/run`;
  const first = await post(
    request,
    runPath,
    { input: execution.input },
    fetchImpl,
  );
  const directRunId = runId(first.payload);
  if (first.response.ok && directRunId) return { runId: directRunId };
  if (
    first.response.status !== 409 ||
    first.payload.error !== "approval_required" ||
    typeof first.payload.approvalToken !== "string"
  ) {
    throw dispatchError(first.response, first.payload);
  }

  const approval = await post(
    request,
    `/api/kody/company/workflows/${encodeURIComponent(execution.workflowId)}/approve`,
    {
      approvalToken: first.payload.approvalToken,
      input: execution.input,
    },
    fetchImpl,
  );
  if (!approval.response.ok || typeof approval.payload.approvalId !== "string") {
    throw dispatchError(approval.response, approval.payload);
  }

  const dispatched = await post(
    request,
    runPath,
    {
      approvalId: approval.payload.approvalId,
      input: execution.input,
    },
    fetchImpl,
  );
  const approvedRunId = runId(dispatched.payload);
  if (!dispatched.response.ok || !approvedRunId) {
    throw dispatchError(dispatched.response, dispatched.payload);
  }
  return { runId: approvedRunId };
}

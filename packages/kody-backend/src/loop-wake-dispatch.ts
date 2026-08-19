const REPOSITORY = /^[^/\s]+\/[^/\s]+$/;

export interface LoopWakeTarget {
  tenantId: string;
  wakeId: string;
}

export interface LoopWakeRequest {
  jobId: string;
  repo: string;
  runRequest: {
    requestId: string;
    target: { type: "workflow"; id: "scheduled-fanout" };
    intent: "tick";
    source: "schedule";
  };
}

export function buildLoopWakeRequest(
  target: LoopWakeTarget,
): LoopWakeRequest {
  if (!REPOSITORY.test(target.tenantId)) {
    throw new Error("Loop wake tenant must be owner/repository");
  }
  if (!target.wakeId.trim()) throw new Error("Loop wake id is required");
  return {
    jobId: target.wakeId,
    repo: target.tenantId,
    runRequest: {
      requestId: target.wakeId,
      target: { type: "workflow", id: "scheduled-fanout" },
      intent: "tick",
      source: "schedule",
    },
  };
}

export async function dispatchLoopWakeToDashboard(
  target: LoopWakeTarget,
  options: {
    dashboardUrl: string;
    wakeApiKey: string;
    fetcher?: typeof fetch;
  },
): Promise<{ ok: boolean; detail: string }> {
  const url = new URL(options.dashboardUrl);
  if (url.protocol !== "https:") {
    throw new Error("Loop wake Dashboard URL must use HTTPS");
  }
  const apiKey = options.wakeApiKey.trim();
  if (!apiKey) throw new Error("Loop wake API key is required");
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(
    `${url.toString().replace(/\/+$/, "")}/api/kody/loop-wakes/dispatch`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildLoopWakeRequest(target)),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (response.ok) {
    const body = (await response.json().catch(() => null)) as {
      machineId?: unknown;
    } | null;
    if (typeof body?.machineId === "string" && body.machineId.trim()) {
      return { ok: true, detail: "runner accepted" };
    }
    return { ok: false, detail: "Dashboard returned no runner" };
  }
  return {
    ok: false,
    detail: `Dashboard rejected wake (HTTP ${response.status})`,
  };
}

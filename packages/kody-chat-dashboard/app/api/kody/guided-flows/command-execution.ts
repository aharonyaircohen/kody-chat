import type { NextRequest } from "next/server";

export class GuidedFlowCommandError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

export async function executeGuidedFlowCommand(
  req: NextRequest,
  command: string,
  mutationId: string,
): Promise<Readonly<Record<string, unknown>>> {
  const headers = new Headers(req.headers);
  headers.set("content-type", "application/json");
  headers.set("x-kody-idempotency-key", mutationId);
  headers.delete("content-length");
  const response = await fetch(new URL("/api/kody/chat/operations", req.url), {
    method: "POST",
    headers,
    body: JSON.stringify({ input: command }),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    throw new GuidedFlowCommandError(
      typeof payload.error === "string" ? payload.error : "command_failed",
      response.status >= 400 && response.status < 500 ? response.status : 502,
    );
  }
  if (
    payload.handled !== true ||
    !payload.result ||
    typeof payload.result !== "object" ||
    Array.isArray(payload.result)
  ) {
    throw new GuidedFlowCommandError("command_not_executable", 400);
  }
  const result = payload.result as Readonly<Record<string, unknown>>;
  return {
    status: "completed",
    summary:
      typeof result.summary === "string"
        ? result.summary
        : "Command completed.",
  };
}

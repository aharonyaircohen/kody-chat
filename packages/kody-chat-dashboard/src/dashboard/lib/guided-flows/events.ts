export const GUIDED_FLOW_OPEN_EVENT = "kody:guided-flow-open";

export type GuidedFlowOpenRequest =
  | {
      instanceId: string;
      message: "started" | "resumed";
    }
  | {
      flowId: string;
      instanceKey?: string;
      message: "started";
    };

let pendingRequest: GuidedFlowOpenRequest | null = null;
const GLOBAL_REQUEST_KEY = "__kodyGuidedFlowOpenRequest";

export function isGuidedFlowOpenRequest(
  value: unknown,
): value is GuidedFlowOpenRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Record<string, unknown>;
  const isInstanceRequest =
    typeof request.instanceId === "string" &&
    (request.message === "started" || request.message === "resumed");
  const isStartRequest =
    typeof request.flowId === "string" && request.message === "started";
  return isInstanceRequest || isStartRequest;
}

export function requestGuidedFlowOpen(
  instanceId: string,
  message: "started" | "resumed" = "resumed",
): void {
  publishGuidedFlowOpenRequest({ instanceId, message });
}

export function requestGuidedFlowStart(
  flowId: string,
  instanceKey?: string,
): void {
  publishGuidedFlowOpenRequest({
    flowId,
    ...(instanceKey ? { instanceKey } : {}),
    message: "started",
  });
}

function publishGuidedFlowOpenRequest(request: GuidedFlowOpenRequest): void {
  pendingRequest = request;
  (window as Window & { [GLOBAL_REQUEST_KEY]?: GuidedFlowOpenRequest })[
    GLOBAL_REQUEST_KEY
  ] = request;
  window.dispatchEvent(
    new CustomEvent(GUIDED_FLOW_OPEN_EVENT, { detail: request }),
  );
}

export function consumeGuidedFlowOpenRequest(): GuidedFlowOpenRequest | null {
  const globalWindow = window as Window & {
    [GLOBAL_REQUEST_KEY]?: GuidedFlowOpenRequest;
  };
  const request = globalWindow[GLOBAL_REQUEST_KEY] ?? pendingRequest;
  delete globalWindow[GLOBAL_REQUEST_KEY];
  pendingRequest = null;
  return request;
}

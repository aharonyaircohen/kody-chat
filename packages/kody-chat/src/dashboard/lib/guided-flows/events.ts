export const GUIDED_FLOW_OPEN_EVENT = "kody:guided-flow-open";

export interface GuidedFlowOpenRequest {
  instanceId: string;
  message: "started" | "resumed";
}

let pendingRequest: GuidedFlowOpenRequest | null = null;
const GLOBAL_REQUEST_KEY = "__kodyGuidedFlowOpenRequest";

export function requestGuidedFlowOpen(
  instanceId: string,
  message: "started" | "resumed" = "resumed",
): void {
  pendingRequest = { instanceId, message };
  (window as Window & { [GLOBAL_REQUEST_KEY]?: GuidedFlowOpenRequest })[
    GLOBAL_REQUEST_KEY
  ] = pendingRequest;
  window.dispatchEvent(
    new CustomEvent(GUIDED_FLOW_OPEN_EVENT, {
      detail: { instanceId, message },
    }),
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

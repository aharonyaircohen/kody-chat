"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

export type GuidedFlowOpenRequest =
  | {
      readonly instanceId: string;
      readonly message: "started" | "resumed";
    }
  | {
      readonly flowId: string;
      readonly instanceKey?: string;
      readonly message: "started";
    };

export interface GuidedFlowChatState {
  readonly pending: {
    readonly id: string;
    readonly destination: "current" | "chat";
    readonly request: GuidedFlowOpenRequest;
  } | null;
}

type GuidedFlowChatAction =
  | {
      readonly type: "request";
      readonly requestId: string;
      readonly destination?: "current" | "chat";
      readonly request: GuidedFlowOpenRequest;
    }
  | {
      readonly type: "acknowledge";
      readonly requestId: string;
    };

export const initialGuidedFlowChatState: GuidedFlowChatState = {
  pending: null,
};

export function guidedFlowChatReducer(
  state: GuidedFlowChatState,
  action: GuidedFlowChatAction,
): GuidedFlowChatState {
  if (action.type === "request") {
    return {
      pending: {
        id: action.requestId,
        destination: action.destination ?? "current",
        request: action.request,
      },
    };
  }
  return state.pending?.id === action.requestId
    ? initialGuidedFlowChatState
    : state;
}

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

export interface GuidedFlowChatController {
  readonly pending: GuidedFlowChatState["pending"];
  readonly startFlow: (flowId: string, instanceKey?: string) => void;
  readonly startFlowInChat: (flowId: string, instanceKey?: string) => void;
  readonly resumeFlow: (instanceId: string) => void;
  readonly acknowledge: (requestId: string) => void;
}

const GuidedFlowChatContext = createContext<GuidedFlowChatController | null>(
  null,
);

export function GuidedFlowChatProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [state, dispatch] = useReducer(
    guidedFlowChatReducer,
    initialGuidedFlowChatState,
  );
  const request = useCallback(
    (
      next: GuidedFlowOpenRequest,
      destination: "current" | "chat" = "current",
    ) => {
      dispatch({
        type: "request",
        requestId: crypto.randomUUID(),
        destination,
        request: next,
      });
    },
    [],
  );
  const startFlow = useCallback(
    (flowId: string, instanceKey?: string) =>
      request({
        flowId,
        ...(instanceKey ? { instanceKey } : {}),
        message: "started",
      }),
    [request],
  );
  const startFlowInChat = useCallback(
    (flowId: string, instanceKey?: string) =>
      request(
        {
          flowId,
          ...(instanceKey ? { instanceKey } : {}),
          message: "started",
        },
        "chat",
      ),
    [request],
  );
  const resumeFlow = useCallback(
    (instanceId: string) => request({ instanceId, message: "resumed" }),
    [request],
  );
  const acknowledge = useCallback(
    (requestId: string) => dispatch({ type: "acknowledge", requestId }),
    [],
  );
  const value = useMemo<GuidedFlowChatController>(
    () => ({
      pending: state.pending,
      startFlow,
      startFlowInChat,
      resumeFlow,
      acknowledge,
    }),
    [acknowledge, resumeFlow, startFlow, startFlowInChat, state.pending],
  );
  return (
    <GuidedFlowChatContext.Provider value={value}>
      {children}
    </GuidedFlowChatContext.Provider>
  );
}

export function useGuidedFlowChat(): GuidedFlowChatController {
  const controller = useContext(GuidedFlowChatContext);
  if (!controller) {
    throw new Error(
      "useGuidedFlowChat must be used within GuidedFlowChatProvider",
    );
  }
  return controller;
}

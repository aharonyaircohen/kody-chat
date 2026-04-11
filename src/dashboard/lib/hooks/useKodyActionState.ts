/**
 * @fileType hook
 * @domain kody
 * @pattern action-state-polling
 * @ai-summary Polls the Kody action state to detect when the engine is waiting for instructions
 */

import { useState, useEffect, useCallback, useRef } from "react";

export type ActionStatus = "running" | "waiting" | "complete" | "cancelled";

export interface ActionState {
  runId: string;
  actionId: string;
  status: ActionStatus;
  step: string;
  sessionId?: string;
  taskId?: string;
  instructions: string[];
  cancel: boolean;
  lastHeartbeat: string;
}

const POLL_INTERVAL = 3000; // 3s

interface UseKodyActionStateOptions {
  /** Poll interval in ms. Set to 0 to disable polling. */
  pollInterval?: number;
  /** Called when the action is waiting for input. */
  onWaiting?: (state: ActionState) => void;
  /** Called when the action resumes (status changes from waiting). */
  onResumed?: (state: ActionState) => void;
}

/**
 * Poll the dashboard API for the current action state.
 * Detects when Kody is waiting for user instructions.
 */
export function useKodyActionState(
  runId: string | null | undefined,
  options: UseKodyActionStateOptions = {},
) {
  const { pollInterval = POLL_INTERVAL, onWaiting, onResumed } = options;

  const [state, setState] = useState<ActionState | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const prevWaitingRef = useRef(false);

  const fetchState = useCallback(async () => {
    if (!runId) return;

    try {
      const res = await fetch(`/api/kody/action/state/${encodeURIComponent(runId)}`);
      if (!res.ok) return;

      const data = (await res.json()) as { state: ActionState };
      if (!data.state) return;

      const newState = data.state;
      setState(newState);

      const waiting = newState.status === "waiting";
      setIsWaiting(waiting);

      // Detect transition: was waiting, now not waiting
      if (prevWaitingRef.current && !waiting) {
        onResumed?.(newState);
      }
      // Detect transition: was not waiting, now waiting
      if (!prevWaitingRef.current && waiting) {
        onWaiting?.(newState);
      }
      prevWaitingRef.current = waiting;
    } catch {
      // Non-fatal — just don't update
    }
  }, [runId, onWaiting, onResumed]);

  useEffect(() => {
    if (!runId || pollInterval === 0) return;

    fetchState();
    const interval = setInterval(fetchState, pollInterval);
    return () => clearInterval(interval);
  }, [runId, pollInterval, fetchState]);

  /** Manually refresh the state (e.g., after sending an instruction). */
  const refresh = useCallback(() => fetchState(), [fetchState]);

  return { state, isWaiting, refresh };
}

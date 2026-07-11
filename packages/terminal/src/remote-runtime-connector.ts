/**
 * @fileType library
 * @domain terminal
 * @pattern host-injection-hook
 *
 * Host-injected remote runtime connector. The Brain feature lives in
 * @kody-ade/brain (a HIGHER layer that depends on this package), but
 * terminal session-connect needs to resolve the Brain machine target when
 * a session requests `target: "brain"`. Hosts wire the real connector at
 * startup (instrumentation.ts) via `registerBrainHostHooks()` from
 * @kody-ade/brain, mirroring the fly `setBrainServiceResolver` /
 * `setEventFlushScheduler` pattern. Without wiring, brain-targeted
 * sessions fail with a clear error; non-brain sessions are unaffected.
 */

import type { ServerProviderContext } from "@kody-ade/fly/infrastructure/server-context";
import type { ServerProviderInventory } from "@kody-ade/fly/infrastructure/server-machines";

import type { TerminalTargetInput } from "./session";

/**
 * Structural mirror of the brain package's BrainTerminalWarning —
 * defined here so terminal does not import brain.
 */
export interface RemoteRuntimeWarning {
  code: string;
  message: string;
  desiredImageRef?: string;
  runningImageRef?: string | null;
  machineImageRef?: string | null;
}

export interface RemoteRuntimeConnectInput {
  context: ServerProviderContext;
  inventory: ServerProviderInventory;
  requestedTarget: TerminalTargetInput | null;
}

export interface RemoteRuntimeConnectDecision {
  targetInput: TerminalTargetInput | null;
  warnings: RemoteRuntimeWarning[];
}

export type RemoteRuntimeConnector = (
  input: RemoteRuntimeConnectInput,
) => Promise<RemoteRuntimeConnectDecision>;

let connector: RemoteRuntimeConnector | null = null;

export function setRemoteRuntimeConnector(fn: RemoteRuntimeConnector): void {
  connector = fn;
}

export function getRemoteRuntimeConnector(): RemoteRuntimeConnector | null {
  return connector;
}

/**
 * @fileType types
 * @domain terminal
 * @pattern terminal-checkpoints
 *
 * Shared client/server contract for durable terminal checkpoints. A checkpoint
 * is hidden UI state for one terminal identity, not a user-managed snapshot.
 */

import { slugifyTitle } from "@kody-ade/base/slug";

export const TERMINAL_CHECKPOINT_OUTPUT_LIMIT = 16_000;
export const TERMINAL_CHECKPOINT_LIMIT = 40;

export type LocalTerminalCheckpointTransport = {
  type: "local";
  label?: string;
};

export interface LocalTerminalCheckpointLookup {
  transport: LocalTerminalCheckpointTransport;
  chatSessionId: string;
}

export interface LocalTerminalCheckpoint extends LocalTerminalCheckpointLookup {
  id: string;
  key: string;
  cwd?: string;
  shell?: string;
  output: string;
  createdAt: string;
  updatedAt: string;
  savedBy: string;
}

export interface LocalTerminalCheckpointsDocument {
  version: 1;
  checkpoints: LocalTerminalCheckpoint[];
}

export interface LocalTerminalCheckpointInput extends LocalTerminalCheckpointLookup {
  cwd?: string;
  shell?: string;
  output?: string;
}

export function normalizeTerminalCheckpointActor(login: string): string {
  const normalized = login.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(normalized)) {
    throw new Error("Invalid GitHub login for terminal checkpoint storage");
  }
  return normalized;
}

export function terminalCheckpointsPath(login: string): string {
  return `terminal/checkpoints/${normalizeTerminalCheckpointActor(login)}.json`;
}

export function limitTerminalCheckpointOutput(output: string): string {
  return output.slice(-TERMINAL_CHECKPOINT_OUTPUT_LIMIT);
}

function hashId(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function cleanIdPart(value: string): string {
  return slugifyTitle(value, { maxLength: 90, fallback: "terminal" });
}

export function terminalCheckpointKey({
  chatSessionId,
}: LocalTerminalCheckpointLookup): string {
  return `local:${chatSessionId}`;
}

export function terminalCheckpointId(key: string): string {
  return `checkpoint-${hashId(key)}-${cleanIdPart(key)}`.slice(0, 120);
}

export function terminalCheckpointLabel(
  transport: LocalTerminalCheckpointTransport,
): string {
  return transport.label ?? "Local terminal";
}

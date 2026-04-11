/**
 * @fileOverview Kody Action State Store (Dashboard-side)
 * @fileType store
 * @domain kody
 *
 * File-based store for action polling state on the dashboard.
 *
 * NOTE: Vercel serverless functions have ephemeral filesystem.
 * For production, replace this with Vercel KV, Upstash Redis, or Postgres.
 * For local development, this JSON file works fine.
 */

import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".kody-action-store");
const FILE = path.join(DATA_DIR, "action-state.json");

export type ActionStatus = "running" | "waiting" | "complete" | "cancelled";

export interface ActionState {
  runId: string;
  actionId: string;
  sessionId?: string;
  taskId?: string;
  status: ActionStatus;
  step: string;
  instructions: string[];
  cancel: boolean;
  cancelledBy?: string;
  lastHeartbeat: string;
  createdAt: string;
}

async function load(): Promise<Map<string, ActionState>> {
  const map = new Map<string, ActionState>();
  try {
    const raw = await fs.readFile(FILE, "utf-8");
    const arr: ActionState[] = JSON.parse(raw);
    for (const s of arr) map.set(s.runId, s);
  } catch {
    // File doesn't exist or is corrupt — start fresh
  }
  return map;
}

async function save(map: Map<string, ActionState>): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify([...map.values()], null, 2));
}

/** Register or update an action's state. */
export async function upsertActionState(
  update: Partial<ActionState> & { runId: string; actionId: string },
): Promise<ActionState> {
  const map = await load();
  const existing = map.get(update.runId);

  if (existing) {
    if (update.actionId !== existing.actionId) return existing; // Reject different instance
    const updated: ActionState = {
      ...existing,
      ...update,
      lastHeartbeat: new Date().toISOString(),
    };
    map.set(update.runId, updated);
    await save(map);
    return updated;
  }

  const created: ActionState = {
    runId: update.runId,
    actionId: update.actionId,
    sessionId: update.sessionId,
    taskId: update.taskId,
    status: update.status ?? "running",
    step: update.step ?? "",
    instructions: update.instructions ?? [],
    cancel: false,
    cancelledBy: undefined,
    lastHeartbeat: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  map.set(update.runId, created);
  await save(map);
  return created;
}

/** Poll for the next instruction (FIFO). */
export async function pollInstruction(
  runId: string,
  callerActionId: string,
): Promise<{
  instruction: string | null;
  cancel: boolean;
  cancelledBy: string | null;
  actionId: string;
}> {
  const map = await load();
  const state = map.get(runId);
  if (!state) return { instruction: null, cancel: false, cancelledBy: null, actionId: "" };

  return {
    instruction: state.instructions.shift() ?? null,
    cancel: state.cancel,
    cancelledBy: state.cancelledBy ?? null,
    actionId: state.actionId,
  };
}

/** Enqueue an instruction for an action. */
export async function enqueueInstruction(runId: string, instruction: string): Promise<boolean> {
  const map = await load();
  const state = map.get(runId);
  if (!state) return false;
  state.instructions.push(instruction);
  map.set(runId, state);
  await save(map);
  return true;
}

/** Get full state for a runId. */
export async function getActionState(runId: string): Promise<ActionState | null> {
  return (await load()).get(runId) ?? null;
}

/** List all action states. */
export async function listActionStates(): Promise<ActionState[]> {
  return [...(await load()).values()];
}

/** Cancel an action. */
export async function cancelAction(
  runId: string,
  cancelledBy: string,
): Promise<ActionState | null> {
  const map = await load();
  const state = map.get(runId);
  if (!state) return null;
  state.cancel = true;
  state.cancelledBy = cancelledBy;
  map.set(runId, state);
  await save(map);
  return state;
}

/** Delete an action state. */
export async function deleteActionState(runId: string): Promise<boolean> {
  const map = await load();
  const deleted = map.delete(runId);
  if (deleted) await save(map);
  return deleted;
}

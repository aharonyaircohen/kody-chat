/**
 * @fileOverview Kody Event Log Store (Dashboard-side)
 * @fileType store
 * @domain kody
 *
 * NOTE: Replace with Vercel KV / Postgres for production.
 */

import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".kody-action-store");
const FILE = path.join(DATA_DIR, "event-log.json");

export interface EventLogEntry {
  id: string;
  runId: string;
  event: string;
  payload: Record<string, unknown>;
  channel?: string;
  actionState?: { status: string; step: string; sessionId?: string };
  emittedAt: string;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function load(): Promise<EventLogEntry[]> {
  try {
    const raw = await fs.readFile(FILE, "utf-8");
    return JSON.parse(raw) as EventLogEntry[];
  } catch {
    return [];
  }
}

async function save(entries: EventLogEntry[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(entries.slice(-10000), null, 2));
}

/** Append an event entry. */
export async function logEvent(
  event: string,
  payload: Record<string, unknown>,
  actionState?: EventLogEntry["actionState"],
  channel = "pipeline",
): Promise<EventLogEntry> {
  const entries = await load();
  const entry: EventLogEntry = {
    id: generateId(),
    runId: (payload.runId as string) ?? "unknown",
    event,
    payload,
    actionState,
    channel,
    emittedAt: new Date().toISOString(),
  };
  entries.push(entry);
  await save(entries);
  return entry;
}

/** Get all events for a runId. */
export async function getEventHistory(runId: string): Promise<EventLogEntry[]> {
  return (await load()).filter((e) => e.runId === runId);
}

/** Get the most recent event for a runId. */
export async function getLastEvent(runId: string): Promise<EventLogEntry | null> {
  const entries = await load();
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].runId === runId) return entries[i];
  }
  return null;
}

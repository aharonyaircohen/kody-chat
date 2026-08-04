import type { MachineAccess } from "../../chat-types";

export type { MachineAccess } from "../../chat-types";

export interface MachineAvailability {
  local: boolean;
  brain: boolean;
}

export function machineAccessForRuntime(
  stored: MachineAccess | undefined,
  runtime: { kind: string },
): MachineAccess {
  if (stored) return stored;
  return runtime.kind === "brain" ? "brain" : "none";
}

export function availableMachineAccessOptions(
  availability: MachineAvailability,
): MachineAccess[] {
  return [
    "none",
    ...(availability.local ? (["local"] as const) : []),
    ...(availability.brain ? (["brain"] as const) : []),
  ];
}

export interface MachineSelectableEntry {
  agentId: string;
  modelId?: string | null;
}

function isBrainEntry(entry: MachineSelectableEntry): boolean {
  return entry.agentId === "brain" || entry.agentId === "brain-fly";
}

export function modelEntriesForMachineAccess<T extends MachineSelectableEntry>(
  entries: readonly T[],
  machineAccess: MachineAccess,
): T[] {
  if (machineAccess === "brain") {
    return entries.filter(isBrainEntry);
  }
  if (machineAccess === "local") {
    return entries.filter((entry) => entry.agentId === "kody");
  }
  return entries.filter((entry) => !isBrainEntry(entry));
}

export interface ReconciledMachineSelection<T extends MachineSelectableEntry> {
  machineAccess: MachineAccess;
  replacementEntry?: T;
}

export function reconcileMachineSelection<
  T extends MachineSelectableEntry,
>(input: {
  entries: readonly T[];
  machineAccess: MachineAccess;
  selectedAgentId: string;
  selectedModelId: string | null;
}): ReconciledMachineSelection<T> {
  const compatibleEntries = modelEntriesForMachineAccess(
    input.entries,
    input.machineAccess,
  );
  const currentIsCompatible = compatibleEntries.some(
    (entry) =>
      entry.agentId === input.selectedAgentId &&
      (entry.modelId ?? null) === input.selectedModelId,
  );
  if (currentIsCompatible) return { machineAccess: input.machineAccess };
  if (compatibleEntries[0]) {
    return {
      machineAccess: input.machineAccess,
      replacementEntry: compatibleEntries[0],
    };
  }
  if (input.machineAccess !== "none") {
    return reconcileMachineSelection({ ...input, machineAccess: "none" });
  }
  return { machineAccess: "none" };
}

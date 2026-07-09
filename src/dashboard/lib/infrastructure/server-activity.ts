import { serverOperations } from "./server-operations";
import type {
  ProviderActivitySample,
  ProviderInventory,
} from "./server-operations";

export type ServerProviderActivitySample = ProviderActivitySample;

export function computeServerProviderActivity(file: unknown) {
  return serverOperations.provider().computeActivity(file as never);
}

export function readServerProviderActivityFile(
  octokit: unknown,
  owner: string,
  repo: string,
) {
  return serverOperations
    .provider()
    .readActivityFile(octokit as never, owner, repo);
}

export function recordServerProviderSnapshot(
  octokit: unknown,
  owner: string,
  repo: string,
  snapshot: unknown,
) {
  return serverOperations
    .provider()
    .recordSnapshot(octokit as never, owner, repo, snapshot as never);
}

export function snapshotFromServerProviderInventory(
  inventory: ProviderInventory,
  now: number,
) {
  return serverOperations.provider().snapshotFromInventory(inventory, now);
}

export function snapshotDue(
  file: { snapshots?: Array<{ ts: number }> },
  now: number,
): boolean {
  const snapshots = file.snapshots ?? [];
  const last = snapshots[snapshots.length - 1];
  return !last || now - last.ts >= 5 * 60_000;
}

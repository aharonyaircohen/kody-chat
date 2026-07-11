/**
 * @fileType library
 * @domain preview
 * @pattern host-injection-hook
 *
 * Host-injected reader for the repo's tracked branch-preview list. The list
 * lives in the host's dashboard config (`dashboard.json` in the state repo,
 * a host-owned module the fly package must not depend on). Hosts wire the
 * real reader at startup (instrumentation.ts), mirroring the events
 * setEventFlushScheduler pattern. Without wiring, tracked-branch pushes
 * build nothing — graceful degradation, not an error.
 */

import type { Octokit } from "@octokit/rest";

export type TrackedBranchesReader = (
  octokit: Octokit,
  owner: string,
  repo: string,
) => Promise<string[]>;

let reader: TrackedBranchesReader | null = null;

export function setTrackedBranchesReader(fn: TrackedBranchesReader): void {
  reader = fn;
}

export function getTrackedBranchesReader(): TrackedBranchesReader | null {
  return reader;
}

/**
 * @fileType service
 * @domain brain
 * @pattern brain-runtime-manager
 *
 * Owns Brain desired/running state transitions. API routes and terminal
 * session code should depend on this layer instead of reading image catalog
 * internals.
 */
import "server-only";

import { randomUUID } from "node:crypto";

import { readBrainImage } from "./store";
import {
  readBrainRuntimeState,
  writeBrainRuntimeState,
  type BrainRuntimeOperation,
  type BrainRuntimeRunning,
  type BrainRuntimeStateFile,
} from "./runtime-store";

export interface BrainRuntimeView {
  desiredImageRef?: string;
  runningImageRef?: string;
  runningAt?: string;
  runningApp?: string;
  runningMachineId?: string;
  runningOrgSlug?: string;
  runningUrl?: string;
  operation?: BrainRuntimeOperation;
  source: "runtime" | "legacy" | "empty";
}

export async function readBrainRuntimeView(
  login: string,
  token: string,
): Promise<BrainRuntimeView> {
  const runtime = await readBrainRuntimeState(login, token, true);
  if (runtime?.running) {
    return viewFromRuntime(runtime);
  }
  const legacyImage = await readBrainImage(login, token).catch(() => null);
  if (legacyImage?.runningImageRef) {
    return {
      desiredImageRef: runtime?.desiredImageRef ?? legacyImage.imageRef,
      runningImageRef: legacyImage.runningImageRef,
      runningAt: legacyImage.runningAt,
      runningApp: legacyImage.runningApp,
      runningMachineId: legacyImage.runningMachineId,
      operation: runtime?.operation,
      source: "legacy",
    };
  }
  return {
    desiredImageRef: runtime?.desiredImageRef ?? legacyImage?.imageRef,
    operation: runtime?.operation,
    source: runtime ? "runtime" : "empty",
  };
}

/**
 * Clear the deployed Fly runtime after Brain is turned off while preserving
 * the desired image selection for a future apply.
 */
export async function clearBrainRuntimeDeployment(
  login: string,
  token: string,
): Promise<void> {
  const current = await readBrainRuntimeState(login, token, true);
  if (!current?.running && !current?.operation) return;
  await writeBrainRuntimeState(login, token, {
    version: 1,
    ...(current.desiredImageRef
      ? { desiredImageRef: current.desiredImageRef }
      : {}),
    updatedAt: new Date().toISOString(),
  });
}

function viewFromRuntime(runtime: BrainRuntimeStateFile): BrainRuntimeView {
  const running = runtime.running;
  return {
    desiredImageRef: runtime.desiredImageRef,
    ...(running
      ? {
          runningImageRef: running.imageRef,
          runningAt: running.appliedAt,
          runningApp: running.app,
          runningMachineId: running.machineId,
          runningOrgSlug: running.orgSlug,
          runningUrl: running.url,
        }
      : {}),
    operation: runtime.operation,
    source: "runtime",
  };
}

export async function beginBrainRuntimeApply(
  login: string,
  token: string,
  imageRef: string,
  type: BrainRuntimeOperation["type"] = "apply-image",
): Promise<BrainRuntimeStateFile> {
  const current = await readBrainRuntimeState(login, token, true);
  const now = new Date(
    Math.max(Date.now(), (Date.parse(current?.updatedAt ?? "") || 0) + 1),
  ).toISOString();
  if (current?.operation?.status === "running") {
    throw Object.assign(
      new Error(
        "Another Brain operation is still running. Wait for it to finish.",
      ),
      { status: 409, code: "brain_operation_conflict" },
    );
  }
  const operation: BrainRuntimeOperation = {
    id: randomUUID().replaceAll("-", ""),
    type,
    status: "running",
    imageRef,
    startedAt: now,
    updatedAt: now,
  };
  const next: BrainRuntimeStateFile = {
    version: 1,
    ...(type === "apply-image"
      ? { desiredImageRef: imageRef }
      : current?.desiredImageRef
        ? { desiredImageRef: current.desiredImageRef }
        : {}),
    ...(current?.running ? { running: current.running } : {}),
    operation,
    updatedAt: now,
  };
  await writeBrainRuntimeState(login, token, next, current?.updatedAt ?? null);
  return next;
}

export async function completeBrainRuntimeApply(
  login: string,
  token: string,
  input: {
    operationId: string;
    imageRef: string;
    app: string;
    machineId: string;
    orgSlug: string;
    url?: string;
    appliedAt?: string;
  },
): Promise<BrainRuntimeStateFile> {
  const now = input.appliedAt ?? new Date().toISOString();
  const current = await readBrainRuntimeState(login, token, true);
  assertActiveOperation(current, input.operationId, input.imageRef);
  const running: BrainRuntimeRunning = {
    imageRef: input.imageRef,
    app: input.app,
    machineId: input.machineId,
    orgSlug: input.orgSlug,
    ...(input.url ? { url: input.url } : {}),
    appliedAt: now,
  };
  const operation: BrainRuntimeOperation = {
    id: current?.operation?.id ?? randomUUID().replaceAll("-", ""),
    type: "apply-image",
    status: "completed",
    imageRef: input.imageRef,
    startedAt: current?.operation?.startedAt ?? now,
    updatedAt: now,
  };
  const next: BrainRuntimeStateFile = {
    version: 1,
    desiredImageRef: input.imageRef,
    running,
    operation,
    updatedAt: now,
  };
  await writeBrainRuntimeState(login, token, next, current?.updatedAt ?? null);
  return next;
}

export async function failBrainRuntimeApply(
  login: string,
  token: string,
  imageRef: string,
  error: string,
  operationId: string,
): Promise<void> {
  const current = await readBrainRuntimeState(login, token, true);
  const now = new Date(
    Math.max(Date.now(), (Date.parse(current?.updatedAt ?? "") || 0) + 1),
  ).toISOString();
  assertActiveOperation(current, operationId, imageRef);
  const operation: BrainRuntimeOperation = {
    id: current?.operation?.id ?? randomUUID().replaceAll("-", ""),
    type: "apply-image",
    status: "failed",
    imageRef,
    startedAt: current?.operation?.startedAt ?? now,
    updatedAt: now,
    error,
  };
  await writeBrainRuntimeState(
    login,
    token,
    {
      version: 1,
      desiredImageRef: imageRef,
      ...(current?.running ? { running: current.running } : {}),
      operation,
      updatedAt: now,
    },
    current?.updatedAt ?? null,
  );
}

function assertActiveOperation(
  current: BrainRuntimeStateFile | null,
  id: string,
  imageRef: string,
): void {
  if (
    !id ||
    current?.operation?.id !== id ||
    current.operation.status !== "running" ||
    current.operation.imageRef !== imageRef
  ) {
    throw Object.assign(new Error("Brain operation is no longer current"), {
      status: 409,
      code: "brain_operation_conflict",
    });
  }
}

export async function finishBrainImageSaveOperation(
  login: string,
  token: string,
  operationId: string,
  error?: string,
): Promise<void> {
  const current = await readBrainRuntimeState(login, token, true);
  // Legacy saves predate operation ownership. Never overwrite a newer operation.
  if (
    current?.operation?.type !== "save-image" ||
    current.operation.id !== operationId ||
    current.operation.status !== "running"
  )
    return;
  const now = new Date(
    Math.max(Date.now(), (Date.parse(current.updatedAt) || 0) + 1),
  ).toISOString();
  await writeBrainRuntimeState(
    login,
    token,
    {
      ...current,
      updatedAt: now,
      operation: {
        ...current.operation,
        status: error ? "failed" : "completed",
        updatedAt: now,
        ...(error ? { error } : {}),
      },
    },
    current.updatedAt,
  );
}

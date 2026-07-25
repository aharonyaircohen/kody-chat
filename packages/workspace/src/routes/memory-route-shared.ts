import {
  verifyRepoReadAccess,
  verifyRepoWriteAccess,
} from "@kody-ade/base/auth";
import {
  MemoryAccessDeniedError,
  MemoryNotFoundError,
  type EvidenceRef,
} from "@kody-ade/memory";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createMemoryRuntime } from "../memory/runtime";

type AccessMode = "read" | "write";

export async function requestMemoryContext(
  request: NextRequest,
  mode: AccessMode,
) {
  const access =
    mode === "read"
      ? await verifyRepoReadAccess(request)
      : await verifyRepoWriteAccess(request);
  if (access instanceof NextResponse) return access;

  const tenantId = `${access.auth.owner}/${access.auth.repo}`;
  const runtime = createMemoryRuntime({
    actorId: `github:${access.actorGithubId}`,
    tenantId,
  });
  return runtime;
}

export function userInputEvidence(): Readonly<EvidenceRef> {
  return Object.freeze({
    source: "user-input",
    id: `request-${crypto.randomUUID()}`,
  });
}

export function memoryErrorResponse(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: "validation_error", details: error.issues },
      { status: 400 },
    );
  }
  if (error instanceof MemoryNotFoundError) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (error instanceof MemoryAccessDeniedError) {
    return NextResponse.json(
      { error: "memory_access_denied" },
      { status: 403 },
    );
  }
  console.error(`[Memory] ${fallback}:`, error);
  return NextResponse.json(
    { error: "memory_request_failed", message: fallback },
    { status: 500 },
  );
}

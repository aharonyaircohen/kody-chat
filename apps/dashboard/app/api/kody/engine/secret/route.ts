import { NextResponse } from "next/server";
import { z } from "zod";

import { api as backendApi } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import { decrypt, encrypt } from "@kody-ade/base/vault/crypto";
import type { VaultDocument } from "@kody-ade/base/vault/store";
import {
  bearerToken,
  verifyGitHubWorkflowIdentity,
} from "@dashboard/lib/backend/github-actions-identity";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };
const requestSchema = z.object({
  name: z.string().regex(/^[A-Z][A-Z0-9_]{0,127}$/),
});
const upsertSchema = requestSchema.extend({
  value: z
    .string()
    .min(1)
    .max(64 * 1024),
});

async function workflowRepository(
  request: Request,
): Promise<
  { repository: string; actor: string } | NextResponse<{ error: string }>
> {
  const token = bearerToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "missing_workflow_identity" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const identity = await verifyGitHubWorkflowIdentity(token);
    return {
      repository: identity.repository,
      actor: identity.actor ?? "github-actions",
    };
  } catch {
    return NextResponse.json(
      { error: "invalid_workflow_identity" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }
}

export async function POST(request: Request) {
  const identity = await workflowRepository(request);
  if (identity instanceof NextResponse) return identity;
  const { repository } = identity;

  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const record = (await createBackendClient().query(backendApi.repoDocs.get, {
      tenantId: repository,
      kind: "secrets.enc",
    })) as { doc?: { ciphertext?: string } } | null;
    const ciphertext = record?.doc?.ciphertext?.trim();
    if (!ciphertext) {
      return NextResponse.json(
        { error: "secret_not_found" },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    const vault = JSON.parse(decrypt(ciphertext)) as VaultDocument;
    const value =
      vault.version === 1 ? vault.secrets?.[parsed.data.name]?.value : null;
    if (!value) {
      return NextResponse.json(
        { error: "secret_not_found" },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json({ value }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Kody engine secret request failed", {
      repository,
      name: parsed.data.name,
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "secret_request_failed" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

export async function PUT(request: Request) {
  const identity = await workflowRepository(request);
  if (identity instanceof NextResponse) return identity;

  const parsed = upsertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const updatedAt = new Date().toISOString();
  try {
    const backend = createBackendClient();
    const record = (await backend.query(backendApi.repoDocs.get, {
      tenantId: identity.repository,
      kind: "secrets.enc",
    })) as { doc?: { ciphertext?: string } } | null;
    const ciphertext = record?.doc?.ciphertext?.trim();
    const current = ciphertext
      ? (JSON.parse(decrypt(ciphertext)) as VaultDocument)
      : ({ version: 1, secrets: {} } satisfies VaultDocument);
    if (current.version !== 1 || typeof current.secrets !== "object") {
      throw new Error("vault document has an unexpected shape");
    }

    const next: VaultDocument = {
      ...current,
      secrets: {
        ...current.secrets,
        [parsed.data.name]: {
          value: parsed.data.value,
          updatedAt,
          updatedBy: identity.actor,
        },
      },
    };
    await backend.mutation(backendApi.repoDocs.save, {
      tenantId: identity.repository,
      kind: "secrets.enc",
      doc: { ciphertext: encrypt(JSON.stringify(next)) },
      updatedAt,
    });
    return NextResponse.json(
      { ok: true, name: parsed.data.name },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("Kody engine secret upsert failed", {
      repository: identity.repository,
      name: parsed.data.name,
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "secret_upsert_failed" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

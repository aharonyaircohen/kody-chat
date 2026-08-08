/**
 * @fileType api-endpoint
 * @domain vault
 * @pattern secrets-api
 * @ai-summary GET — list secret names + last-modified for the connected repo.
 *   POST — upsert a secret { name, value }. Values are never returned.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireKodyAuth,
  verifyActorLogin,
  getUserOctokit,
  getRequestAuth,
} from "@kody-ade/base/auth";
import { listSecretMetadata, readVault } from "@kody-ade/base/vault/store";
import {
  SecretWriteSchema,
  upsertSecret,
} from "@kody-ade/base/vault/mutations";
import { isVaultConfigured } from "@kody-ade/base/vault/crypto";
import { recordAudit } from "@dashboard/lib/activity/audit";
import { logger } from "@kody-ade/base/logger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

function vaultUnconfiguredResponse() {
  return NextResponse.json(
    {
      error: "vault_not_configured",
      message:
        "KODY_MASTER_KEY is not set on the server. Run `pnpm vault:init` and add the key to Vercel env.",
    },
    { status: 503, headers: NO_STORE_HEADERS },
  );
}

export async function GET(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError) return authError;
  if (!isVaultConfigured()) return vaultUnconfiguredResponse();

  const auth = getRequestAuth(req);
  if (!auth) {
    return NextResponse.json(
      { error: "no_repo_context" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const octokit = await getUserOctokit(req);
  if (!octokit)
    return NextResponse.json(
      { error: "no_octokit" },
      { status: 401, headers: NO_STORE_HEADERS },
    );

  try {
    const { doc } = await readVault(octokit, auth.owner, auth.repo);
    return NextResponse.json(
      { secrets: listSecretMetadata(doc) },
      { headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    logger.error(
      { err, owner: auth.owner, repo: auth.repo },
      "vault: list failed",
    );
    return NextResponse.json(
      { error: "vault_read_failed", message: (err as Error).message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError) return authError;
  if (!isVaultConfigured()) return vaultUnconfiguredResponse();

  const auth = getRequestAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "no_repo_context" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = SecretWriteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const verify = await verifyActorLogin(req, parsed.data.actorLogin);
  if ("status" in verify) return verify;
  const actorLogin = verify.identity.login;

  const octokit = await getUserOctokit(req);
  if (!octokit)
    return NextResponse.json({ error: "no_octokit" }, { status: 401 });

  try {
    const result = await upsertSecret({
      octokit,
      owner: auth.owner,
      repo: auth.repo,
      name: parsed.data.name,
      value: parsed.data.value,
      actorLogin,
    });
    recordAudit(req, {
      action: "vault.write",
      resource: parsed.data.name,
      detail: "upsert secret",
    });
    return NextResponse.json({ ok: true, secrets: result.secrets });
  } catch (err) {
    logger.error(
      { err, owner: auth.owner, repo: auth.repo, name: parsed.data.name },
      "vault: upsert failed",
    );
    return NextResponse.json(
      { error: "vault_write_failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}

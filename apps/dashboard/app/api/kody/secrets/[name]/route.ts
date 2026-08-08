/**
 * @fileType api-endpoint
 * @domain vault
 * @pattern secrets-api
 * @ai-summary DELETE /api/kody/secrets/[name] — remove a secret from the vault.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireKodyAuth,
  getUserOctokit,
  getRequestAuth,
} from "@kody-ade/base/auth";
import { deleteSecret } from "@kody-ade/base/vault/mutations";
import { ConfigNameSchema } from "@kody-ade/base/variables/mutations";
import { isVaultConfigured } from "@kody-ade/base/vault/crypto";
import { recordAudit } from "@dashboard/lib/activity/audit";
import { logger } from "@kody-ade/base/logger";

interface RouteContext {
  params: Promise<{ name: string }>;
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const authError = await requireKodyAuth(req);
  if (authError) return authError;
  if (!isVaultConfigured()) {
    return NextResponse.json(
      { error: "vault_not_configured" },
      { status: 503 },
    );
  }

  const { name } = await context.params;
  if (!name || !ConfigNameSchema.safeParse(name).success) {
    return NextResponse.json({ error: "missing_name" }, { status: 400 });
  }

  const auth = getRequestAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "no_repo_context" }, { status: 400 });
  }

  const octokit = await getUserOctokit(req);
  if (!octokit)
    return NextResponse.json({ error: "no_octokit" }, { status: 401 });

  try {
    const result = await deleteSecret({
      octokit,
      owner: auth.owner,
      repo: auth.repo,
      name,
    });
    if (!result.found) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    recordAudit(req, {
      action: "vault.delete",
      resource: name,
      detail: "delete secret",
    });
    return NextResponse.json({ ok: true, secrets: result.secrets });
  } catch (err) {
    logger.error(
      { err, owner: auth.owner, repo: auth.repo, name },
      "vault: delete failed",
    );
    return NextResponse.json(
      { error: "vault_write_failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}

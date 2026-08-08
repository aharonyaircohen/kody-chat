/**
 * @fileType api-endpoint
 * @domain vault
 * @pattern secrets-api
 * @ai-summary GET /api/kody/secrets/[name]/value — return the decrypted
 *   value of a single secret to the authenticated user. Same auth gate
 *   as the rest of the vault API; values never go to anyone outside the
 *   active session. Used by the Settings page to populate masked inputs
 *   for project-scoped credentials (e.g. FLY_API_TOKEN).
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyRepoWriteAccess } from "@kody-ade/base/auth";
import { readVault } from "@kody-ade/base/vault/store";
import { isVaultConfigured } from "@kody-ade/base/vault/crypto";
import { logger } from "@kody-ade/base/logger";
import { MANAGED_BACKGROUND_GITHUB_TOKEN } from "@kody-ade/base/auth/background-token-contract";

interface RouteContext {
  params: Promise<{ name: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  if (!isVaultConfigured()) {
    return NextResponse.json(
      { error: "vault_not_configured" },
      { status: 503 },
    );
  }

  const { name } = await context.params;
  if (!name) {
    return NextResponse.json({ error: "missing_name" }, { status: 400 });
  }
  if (name === MANAGED_BACKGROUND_GITHUB_TOKEN) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const access = await verifyRepoWriteAccess(req);
  if (access instanceof NextResponse) return access;
  const { auth, octokit } = access;

  try {
    const { doc } = await readVault(octokit, auth.owner, auth.repo);
    const entry = doc.secrets[name];
    if (!entry) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({
      name,
      value: entry.value,
      updatedAt: entry.updatedAt,
      updatedBy: entry.updatedBy ?? null,
    });
  } catch (err) {
    logger.error(
      { err, owner: auth.owner, repo: auth.repo, name },
      "vault: value read failed",
    );
    return NextResponse.json(
      { error: "vault_read_failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}

/**
 * @fileType api-route
 * @domain wizards
 * @pattern wizard-check-probe
 * @ai-summary POST — run a wizard `check` step server-side. Body:
 *   { checkId, params }. Probes live in a small registry here; each reads
 *   authenticated fresh state (vault + variables) so a just-saved credential
 *   verifies immediately (no public-bootstrap cache lag).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  requireKodyAuth,
  getUserOctokit,
  getRequestAuth,
} from "@kody-ade/base/auth";
import { readVault } from "@kody-ade/base/vault/store";
import { readVariables } from "@kody-ade/base/variables/store";
import {
  PROVIDER_CATALOG,
  credentialNames,
} from "@dashboard/lib/client-auth/catalog";
import { CLIENT_SIGNIN_CHECK_ID } from "@dashboard/lib/wizards/client-signin";
import { logger } from "@kody-ade/base/logger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

const CheckSchema = z.object({
  checkId: z.string().min(1).max(80),
  params: z.record(z.string(), z.string()).optional(),
});

interface CheckResult {
  ok: boolean;
  message: string;
}

export async function POST(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError) return authError;

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
  const parsed = CheckSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const octokit = await getUserOctokit(req);
  if (!octokit) {
    return NextResponse.json({ error: "no_octokit" }, { status: 401 });
  }

  try {
    let result: CheckResult;
    switch (parsed.data.checkId) {
      case CLIENT_SIGNIN_CHECK_ID:
        result = await checkClientSigninCredentials(
          octokit,
          auth.owner,
          auth.repo,
          parsed.data.params?.provider,
        );
        break;
      default:
        return NextResponse.json(
          { error: "unknown_check" },
          { status: 404, headers: NO_STORE_HEADERS },
        );
    }
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    logger.error({ err: error, checkId: parsed.data.checkId }, "wizard check failed");
    return NextResponse.json(
      { ok: false, message: "Check failed to run — try again." },
      { headers: NO_STORE_HEADERS },
    );
  }
}

async function checkClientSigninCredentials(
  octokit: NonNullable<Awaited<ReturnType<typeof getUserOctokit>>>,
  owner: string,
  repo: string,
  provider: string | undefined,
): Promise<CheckResult> {
  if (!provider || !(provider in PROVIDER_CATALOG)) {
    return { ok: false, message: "Unknown provider." };
  }
  const names = credentialNames(provider);
  const requiredVariables = [
    names.id,
    ...Object.values(PROVIDER_CATALOG[provider]?.extra ?? {}),
  ];

  const { doc: variablesDoc } = await readVariables(octokit, owner, repo, {
    force: true,
  });
  const missingVariables = requiredVariables.filter(
    (name) => !variablesDoc.variables[name]?.value?.trim(),
  );

  const { doc: vaultDoc } = await readVault(octokit, owner, repo, {
    force: true,
  });
  const hasSecret = Boolean(vaultDoc.secrets[names.secret]?.value?.trim());

  const missing = [...missingVariables, ...(hasSecret ? [] : [names.secret])];
  if (missing.length) {
    return { ok: false, message: `Missing: ${missing.join(", ")}` };
  }
  return { ok: true, message: "Credentials configured — sign-in is ready." };
}

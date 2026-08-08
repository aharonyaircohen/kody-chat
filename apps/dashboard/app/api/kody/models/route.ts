/**
 * @fileType api-endpoint
 * @domain variables
 * @pattern models-api
 * @ai-summary GET — list chat models from the LLM_MODELS variable.
 *   PUT — replace the entire list with a validated ChatModel[] array.
 *   Backing storage is the LLM_MODELS entry in backend variables.json.
 *
 *   Why a dedicated route instead of /api/kody/variables: validation. The
 *   chat UI dropdown and the chat route both depend on the shape, so we
 *   parse with the Zod schema here and reject anything malformed before
 *   it lands on disk.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireKodyAuth,
  verifyActorLogin,
  getUserOctokit,
  getRequestAuth,
} from "@kody-ade/base/auth";
import { readVariables } from "@kody-ade/base/variables/store";
import {
  ModelsWriteSchema,
  readManagedChatModels,
  saveManagedChatModels,
} from "@kody-ade/base/variables/mutations";
import { logger } from "@kody-ade/base/logger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function GET(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError) return authError;

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
    const { doc } = await readVariables(auth.owner, auth.repo);
    return NextResponse.json(
      { models: readManagedChatModels(doc) },
      { headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    logger.error(
      { err, owner: auth.owner, repo: auth.repo },
      "models: list failed",
    );
    return NextResponse.json(
      { error: "models_read_failed", message: (err as Error).message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

export async function PUT(req: NextRequest) {
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

  const parsed = ModelsWriteSchema.safeParse(body);
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
    const result = await saveManagedChatModels({
      octokit,
      owner: auth.owner,
      repo: auth.repo,
      models: parsed.data.models,
      actorLogin,
    });
    return NextResponse.json({
      ok: true,
      models: result.models,
      ...(result.engineSyncWarning
        ? { engineSyncWarning: result.engineSyncWarning }
        : {}),
    });
  } catch (err) {
    logger.error(
      { err, owner: auth.owner, repo: auth.repo },
      "models: write failed",
    );
    return NextResponse.json(
      { error: "models_write_failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}

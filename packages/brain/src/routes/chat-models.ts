import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireKodyAuth } from "@kody-ade/base/auth";
import { resolveServerProviderContext } from "@kody-ade/fly/infrastructure/server-context";
import {
  BrainChatModelsSchema,
  normalizeBrainChatModels,
} from "../chat-models";
import { readBrainChatModels, writeBrainChatModels } from "../chat-model-store";
import { clearGitHubContext, setGitHubContext } from "../github";

const PutSchema = z.object({ models: BrainChatModelsSchema });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function contextFor(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError) return { response: authError } as const;
  const ctx = await resolveServerProviderContext(req);
  if (!ctx.ok) {
    return {
      response: NextResponse.json({ error: ctx.error }, { status: ctx.status }),
    } as const;
  }
  setGitHubContext(
    ctx.context.owner,
    ctx.context.repo,
    ctx.context.githubToken,
    ctx.context.storeRepoUrl,
    ctx.context.storeRef,
  );
  return { ctx } as const;
}

export async function GET(req: NextRequest) {
  const result = await contextFor(req);
  if ("response" in result) return result.response;
  try {
    const models = await readBrainChatModels(
      result.ctx.context.account,
      result.ctx.context.githubToken,
    );
    return NextResponse.json(
      { models },
      { headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    clearGitHubContext();
  }
}

export async function PUT(req: NextRequest) {
  const result = await contextFor(req);
  if ("response" in result) return result.response;
  try {
    const body = await req.json().catch(() => null);
    const parsed = PutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", details: parsed.error.format() },
        { status: 400 },
      );
    }
    const models = await writeBrainChatModels(
      result.ctx.context.account,
      result.ctx.context.githubToken,
      normalizeBrainChatModels(parsed.data.models),
    );
    return NextResponse.json({ ok: true, models });
  } finally {
    clearGitHubContext();
  }
}

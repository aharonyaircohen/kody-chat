import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  decrypt,
  encrypt,
  isVaultConfigured,
} from "@kody-ade/base/vault/crypto";
import { KODY_INTERNAL_CREDENTIAL_PREFIX } from "@kody-ade/base/auth/internal-credentials";
import { requireKodyUser } from "@dashboard/lib/auth/kody-user";
import {
  backendApi,
  getConvexClient,
} from "@dashboard/lib/backend/convex-backend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };
const CREDENTIAL_NAME = `${KODY_INTERNAL_CREDENTIAL_PREFIX}REPOSITORY_CONNECTIONS`;

const GitHubUserSchema = z.object({
  login: z.string().min(1).max(100),
  avatar_url: z.string().max(2_048),
  id: z.number(),
});

const RepositorySchema = z.object({
  repoUrl: z.string().max(2_048),
  owner: z.string().min(1).max(100),
  repo: z.string().min(1).max(100),
  token: z.string().min(1).max(16_384),
  addedAt: z.number(),
  isLogin: z.boolean(),
  user: GitHubUserSchema.optional(),
});

const AccountRepositoryAuthSchema = z.object({
  repoUrl: z.string().max(2_048),
  owner: z.string().max(100),
  repo: z.string().max(100),
  token: z.string().max(16_384),
  user: GitHubUserSchema,
  loggedInAt: z.number(),
  repos: z.array(RepositorySchema).max(100),
  currentRepoIndex: z.number(),
  brain: z
    .object({ url: z.string().max(2_048), apiKey: z.string().max(16_384) })
    .optional(),
  vercelBypassSecret: z.string().max(16_384).optional(),
  flyPerf: z.enum(["low", "medium", "high"]).optional(),
  brainPerf: z.enum(["low", "medium", "high"]).optional(),
  brainSuspension: z.enum(["auto", "never"]).optional(),
  brainTerminalActivityLimit: z
    .union([z.number(), z.literal("never")])
    .optional(),
  storeRepoUrl: z.string().max(2_048).optional(),
  storeRef: z.string().max(300).optional(),
});

function unavailable() {
  return NextResponse.json(
    { error: "credential_store_not_configured" },
    { status: 503, headers: NO_STORE_HEADERS },
  );
}

export async function GET() {
  const user = await requireKodyUser();
  if (user instanceof NextResponse) return user;
  if (!isVaultConfigured()) return unavailable();

  const stored = await getConvexClient().query(backendApi.userCredentials.get, {
    userKey: user.id,
    name: CREDENTIAL_NAME,
  });
  if (!stored) {
    return NextResponse.json({ auth: null }, { headers: NO_STORE_HEADERS });
  }
  try {
    const auth = AccountRepositoryAuthSchema.parse(
      JSON.parse(decrypt(stored.encryptedValue)),
    );
    return NextResponse.json({ auth }, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json(
      { error: "repository_connections_invalid" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

export async function PUT(req: NextRequest) {
  const user = await requireKodyUser();
  if (user instanceof NextResponse) return user;
  if (!isVaultConfigured()) return unavailable();
  const parsed = AccountRepositoryAuthSchema.safeParse(
    (await req.json().catch(() => null))?.auth,
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error" }, { status: 400 });
  }
  await getConvexClient().mutation(backendApi.userCredentials.upsert, {
    userKey: user.id,
    name: CREDENTIAL_NAME,
    encryptedValue: encrypt(JSON.stringify(parsed.data)),
    updatedAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}

export async function DELETE() {
  const user = await requireKodyUser();
  if (user instanceof NextResponse) return user;
  await getConvexClient().mutation(backendApi.userCredentials.remove, {
    userKey: user.id,
    name: CREDENTIAL_NAME,
  });
  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}

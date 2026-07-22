import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
} from "@kody-ade/base/auth";
import {
  grantStoredAgencyApproval,
  listStoredAgencyApprovals,
  revokeStoredAgencyApproval,
} from "../backend/agency-approvals-store";

const scopeKindSchema = z.enum(["loop", "goal", "workflow", "capability"]);
const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/);

const grantSchema = z.object({
  scopeKind: scopeKindSchema,
  scopeId: identifierSchema,
  action: identifierSchema,
  expiresAt: z.iso.datetime({ offset: true }).optional(),
});
const revokeSchema = z.object({ approvalId: identifierSchema });

async function requireRepoWriter(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;
  const auth = getRequestAuth(req);
  const octokit = await getUserOctokit(req);
  if (!auth || !octokit) {
    return NextResponse.json({ error: "request_auth_required" }, { status: 401 });
  }
  try {
    const { data: actor } = await octokit.rest.users.getAuthenticated();
    const { data: access } = await octokit.rest.repos.getCollaboratorPermissionLevel({
      owner: auth.owner,
      repo: auth.repo,
      username: actor.login,
    });
    if (!["admin", "maintain", "write"].includes(access.permission)) {
      return NextResponse.json({ error: "write_permission_required" }, { status: 403 });
    }
    return { auth, actorLogin: actor.login };
  } catch {
    return NextResponse.json({ error: "github_identity_verification_failed" }, { status: 403 });
  }
}

export async function GET(req: NextRequest) {
  const access = await requireRepoWriter(req);
  if (access instanceof NextResponse) return access;
  const query = req.nextUrl.searchParams;
  const parsed = z
    .object({
      scopeKind: scopeKindSchema.optional(),
      scopeId: identifierSchema.optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    })
    .refine((value) => Boolean(value.scopeKind) === Boolean(value.scopeId), {
      message: "scopeKind and scopeId must be provided together",
    })
    .safeParse({
      scopeKind: query.get("scopeKind") ?? undefined,
      scopeId: query.get("scopeId") ?? undefined,
      limit: query.get("limit") ?? undefined,
    });
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error" }, { status: 400 });
  }
  try {
    const approvals = await listStoredAgencyApprovals({
      owner: access.auth.owner,
      repo: access.auth.repo,
      ...parsed.data,
    });
    return NextResponse.json({ approvals });
  } catch {
    return NextResponse.json({ error: "approval_list_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const access = await requireRepoWriter(req);
  if (access instanceof NextResponse) return access;
  const parsed = grantSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error" }, { status: 400 });
  }
  const approvedAt = new Date().toISOString();
  if (parsed.data.expiresAt && parsed.data.expiresAt <= approvedAt) {
    return NextResponse.json({ error: "expiry_must_be_future" }, { status: 400 });
  }
  const approvalId = `approval-${randomUUID()}`;
  try {
    await grantStoredAgencyApproval({
      owner: access.auth.owner,
      repo: access.auth.repo,
      approvalId,
      approvedBy: access.actorLogin,
      approvedAt,
      ...parsed.data,
    });
    return NextResponse.json({ approvalId }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "approval_grant_failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const access = await requireRepoWriter(req);
  if (access instanceof NextResponse) return access;
  const parsed = revokeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error" }, { status: 400 });
  }
  try {
    await revokeStoredAgencyApproval({
      owner: access.auth.owner,
      repo: access.auth.repo,
      approvalId: parsed.data.approvalId,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "approval_revoke_failed" }, { status: 500 });
  }
}

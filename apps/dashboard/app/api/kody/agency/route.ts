import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth, requireKodyAuth } from "@kody-ade/base/auth";
import { api } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import { createAgencyDefinition } from "@kody-ade/agency-domain";

const KIND = "agency:intent";

export async function GET(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;
  const auth = getRequestAuth(req);
  if (!auth) {
    return NextResponse.json(
      { error: "repository_context_required" },
      { status: 400 },
    );
  }
  const record = (await createBackendClient().query(api.repoDocs.get, {
    tenantId: `${auth.owner}/${auth.repo}`,
    kind: KIND,
  })) as { doc: { intent?: unknown }; updatedAt: string } | null;
  return NextResponse.json({
    agency: createAgencyDefinition({
      intent:
        typeof record?.doc.intent === "string" && record.doc.intent.trim()
          ? record.doc.intent
          : "Describe what this Agency should accomplish.",
    }),
    updatedAt: record?.updatedAt ?? null,
  });
}

export async function PATCH(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;
  const auth = getRequestAuth(req);
  if (!auth) {
    return NextResponse.json(
      { error: "repository_context_required" },
      { status: 400 },
    );
  }
  try {
    const agency = createAgencyDefinition(await req.json());
    const updatedAt = new Date().toISOString();
    await createBackendClient().mutation(api.repoDocs.save, {
      tenantId: `${auth.owner}/${auth.repo}`,
      kind: KIND,
      doc: agency,
      updatedAt,
    });
    return NextResponse.json({ agency, updatedAt });
  } catch (error) {
    return NextResponse.json(
      {
        error: "invalid_intent",
        message: error instanceof Error ? error.message : "Invalid intent",
      },
      { status: 400 },
    );
  }
}

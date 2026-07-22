import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createAgentDefinition,
  createCapabilityDefinition,
  createGoalDefinition,
  createIntentDefinition,
  createLoopDefinition,
  createOperationDefinition,
  createWorkflowDefinition,
} from "@kody-ade/agency-domain";
import {
  AGENCY_DEFINITION_KINDS,
  createStoredAgencyDefinition,
  listStoredAgencyDefinitions,
  type AgencyDefinitionKind,
  type StoredAgencyDefinition,
} from "../backend/agency-model-store";
import { verifyRepoWriteAccess } from "./repo-write-access";

const kindSchema = z.enum(AGENCY_DEFINITION_KINDS);
const createSchema = z.object({ kind: kindSchema, definition: z.unknown() });

function validate(kind: AgencyDefinitionKind, definition: unknown) {
  if (kind === "intent") return createIntentDefinition(definition);
  if (kind === "operation") return createOperationDefinition(definition);
  if (kind === "goal") return createGoalDefinition(definition);
  if (kind === "loop") return createLoopDefinition(definition);
  if (kind === "workflow") return createWorkflowDefinition(definition);
  if (kind === "capability") return createCapabilityDefinition(definition);
  return createAgentDefinition(definition);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function immutableRecordId(kind: AgencyDefinitionKind, definition: { id: string }) {
  const hash = createHash("sha256").update(canonical(definition)).digest("hex");
  return `${kind}:${definition.id}:${hash}`;
}

function latestByDomainId(records: StoredAgencyDefinition[]) {
  const latest = new Map<string, StoredAgencyDefinition>();
  for (const record of records) {
    const key = `${record.kind}:${record.data.id}`;
    const current = latest.get(key);
    if (!current || current.createdAt < record.createdAt) latest.set(key, record);
  }
  return [...latest.values()];
}

export async function GET(req: NextRequest) {
  const access = await verifyRepoWriteAccess(req);
  if (access instanceof NextResponse) return access;
  const parsedKind = kindSchema.optional().safeParse(req.nextUrl.searchParams.get("kind") ?? undefined);
  if (!parsedKind.success) {
    return NextResponse.json({ error: "validation_error" }, { status: 400 });
  }
  try {
    const all = await listStoredAgencyDefinitions(access.auth.owner, access.auth.repo);
    const definitions = latestByDomainId(all).filter(
      (record) => parsedKind.data === undefined || record.kind === parsedKind.data,
    );
    return NextResponse.json({ definitions });
  } catch {
    return NextResponse.json({ error: "definition_list_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const access = await verifyRepoWriteAccess(req);
  if (access instanceof NextResponse) return access;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error" }, { status: 400 });
  }
  let definition: ReturnType<typeof validate>;
  try {
    definition = validate(parsed.data.kind, parsed.data.definition);
  } catch (error) {
    return NextResponse.json(
      { error: "invalid_definition", message: error instanceof Error ? error.message : "Invalid definition" },
      { status: 400 },
    );
  }
  const recordId = immutableRecordId(parsed.data.kind, definition);
  const createdAt = new Date().toISOString();
  try {
    await createStoredAgencyDefinition({
      owner: access.auth.owner,
      repo: access.auth.repo,
      recordId,
      kind: parsed.data.kind,
      data: definition,
      createdAt,
    });
    return NextResponse.json({ recordId, definition }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /immutable|already exists/i.test(error.message)) {
      return NextResponse.json({ recordId, definition }, { status: 200 });
    }
    return NextResponse.json({ error: "definition_create_failed" }, { status: 500 });
  }
}

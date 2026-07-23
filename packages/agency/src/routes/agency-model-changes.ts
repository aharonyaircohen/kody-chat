import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createAgentDefinition,
  createCapabilityDefinition,
  createGoalDefinition,
  createGoalState,
  createImplementationDefinition,
  createIntentDefinition,
  createIntentState,
  createLoopDefinition,
  createLoopState,
  createOperationDefinition,
  createOperationState,
  createWorkflowDefinition,
} from "@kody-ade/agency-domain";

import {
  AGENCY_DEFINITION_KINDS,
  agencyDefinitionRecordId,
  applyStoredAgencyModelChange,
  type AgencyDefinitionKind,
  type StoredAgencyState,
} from "../backend/agency-model-store";
import { verifyRepoWriteAccess } from "./repo-write-access";

const definitionKind = z.enum(AGENCY_DEFINITION_KINDS);
const stateKind = z.enum(["intent", "operation", "goal", "loop"]);
const changeSchema = z.object({
  definitions: z
    .array(z.object({ kind: definitionKind, definition: z.unknown() }))
    .default([]),
  states: z
    .array(z.object({ kind: stateKind, state: z.unknown() }))
    .default([]),
});

function definition(
  kind: AgencyDefinitionKind,
  value: unknown,
): { id: string } {
  if (kind === "intent") return createIntentDefinition(value);
  if (kind === "operation") return createOperationDefinition(value);
  if (kind === "goal") return createGoalDefinition(value);
  if (kind === "loop") return createLoopDefinition(value);
  if (kind === "workflow") return createWorkflowDefinition(value);
  if (kind === "capability") return createCapabilityDefinition(value);
  if (kind === "implementation") return createImplementationDefinition(value);
  return createAgentDefinition(value);
}

function state(
  kind: StoredAgencyState["kind"],
  value: unknown,
): { definitionId: string; lifecycle: unknown; updatedAt: string } {
  if (kind === "intent") return createIntentState(value);
  if (kind === "operation") return createOperationState(value);
  if (kind === "goal") return createGoalState(value);
  return createLoopState(value);
}

export async function POST(req: NextRequest) {
  const access = await verifyRepoWriteAccess(req);
  if (access instanceof NextResponse) return access;
  const parsed = changeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error" }, { status: 400 });
  }
  try {
    const createdAt = new Date().toISOString();
    const definitions = parsed.data.definitions.map((item) => {
      const data = definition(item.kind, item.definition);
      return {
        recordId: agencyDefinitionRecordId(item.kind, data),
        kind: item.kind,
        schemaVersion: 1,
        data,
        createdAt,
      };
    });
    const states = parsed.data.states.map((item) => {
      const data = state(item.kind, item.state);
      return {
        definitionId: data.definitionId,
        kind: item.kind,
        schemaVersion: 1,
        data,
        updatedAt: data.updatedAt,
      };
    });
    const result = await applyStoredAgencyModelChange({
      owner: access.auth.owner,
      repo: access.auth.repo,
      change: { definitions, states },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "model_change_failed",
        message:
          error instanceof Error ? error.message : "Agency model change failed",
      },
      { status: 409 },
    );
  }
}

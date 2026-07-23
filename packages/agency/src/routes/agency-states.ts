import { NextRequest, NextResponse } from "next/server";
import {
  assertLifecycleTransition,
  createGoalState,
  createIntentState,
  createLoopState,
  createOperationState,
  type GoalState,
  type IntentState,
  type LoopState,
  type OperationState,
} from "@kody-ade/agency-domain";
import {
  listStoredAgencyDefinitions,
  listStoredAgencyStates,
  putStoredAgencyState,
} from "../backend/agency-model-store";
import { verifyRepoWriteAccess } from "./repo-write-access";

type AgencyState = IntentState | OperationState | GoalState | LoopState;
type AgencyStateKind = "intent" | "operation" | "goal" | "loop";

function parseState(kind: AgencyStateKind, value: unknown): AgencyState {
  if (kind === "intent") return createIntentState(value);
  if (kind === "operation") return createOperationState(value);
  if (kind === "goal") return createGoalState(value);
  return createLoopState(value);
}

export async function GET(req: NextRequest) {
  const access = await verifyRepoWriteAccess(req);
  if (access instanceof NextResponse) return access;
  try {
    const states = await listStoredAgencyStates(
      access.auth.owner,
      access.auth.repo,
    );
    return NextResponse.json({ states });
  } catch {
    return NextResponse.json({ error: "state_list_failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const access = await verifyRepoWriteAccess(req);
  if (access instanceof NextResponse) return access;
  const body = (await req.json().catch(() => null)) as {
    kind?: unknown;
    state?: unknown;
  } | null;
  if (
    !body ||
    (body.kind !== "intent" &&
      body.kind !== "operation" &&
      body.kind !== "goal" &&
      body.kind !== "loop")
  ) {
    return NextResponse.json({ error: "validation_error" }, { status: 400 });
  }
  let state: AgencyState;
  try {
    state = parseState(body.kind, body.state);
  } catch (error) {
    return NextResponse.json(
      {
        error: "invalid_state",
        message: error instanceof Error ? error.message : "Invalid state",
      },
      { status: 400 },
    );
  }
  try {
    const [definitions, existingStates] = await Promise.all([
      listStoredAgencyDefinitions(access.auth.owner, access.auth.repo),
      listStoredAgencyStates(access.auth.owner, access.auth.repo),
    ]);
    const definition = definitions
      .filter(
        (record) =>
          record.kind === body.kind && record.data.id === state.definitionId,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    if (!definition) {
      return NextResponse.json(
        { error: "definition_not_found" },
        { status: 404 },
      );
    }
    const existing = existingStates.find(
      (record) =>
        record.kind === body.kind && record.definitionId === state.definitionId,
    );
    if (existing) {
      const previous = parseState(existing.kind, existing.data);
      if (previous.lifecycle !== state.lifecycle) {
        assertLifecycleTransition(previous.lifecycle, state.lifecycle);
      }
    }
    await putStoredAgencyState({
      owner: access.auth.owner,
      repo: access.auth.repo,
      kind: body.kind,
      data: state,
      updatedAt: state.updatedAt,
    });
    return NextResponse.json({ state });
  } catch (error) {
    return NextResponse.json(
      {
        error: "state_update_failed",
        message: error instanceof Error ? error.message : "State update failed",
      },
      { status: 500 },
    );
  }
}

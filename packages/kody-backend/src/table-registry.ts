/** Backend table metadata used by database-native backup and restore. */
export interface TableDef {
  table: string;
  naturalKey: string[];
  upsertIndex?: string;
  global?: boolean;
  /** Exactly one row may exist per tenant; tenantId is the complete identity. */
  tenantSingleton?: boolean;
}

export const TABLES: readonly TableDef[] = [
  {
    table: "definitionHeads",
    naturalKey: ["kind", "slug"],
    upsertIndex: "by_key",
  },
  {
    table: "definitionVersions",
    naturalKey: ["kind", "slug", "version"],
    upsertIndex: "by_version",
  },
  { table: "catalog", naturalKey: ["category", "slug"], upsertIndex: "by_key" },
  { table: "workflows", naturalKey: ["workflowId"], upsertIndex: "by_tenant" },
  {
    table: "workflowRuns",
    naturalKey: ["workflowId", "runId"],
    upsertIndex: "by_run",
  },
  {
    table: "guidedFlowInstances",
    naturalKey: ["actorId", "instanceId"],
    upsertIndex: "by_instance",
  },
  {
    table: "guidedFlowCompletions",
    naturalKey: ["actorId", "instanceId"],
    upsertIndex: "by_completion",
  },
  {
    table: "guidedFlowDefinitions",
    naturalKey: ["actorId", "flowId", "version"],
    upsertIndex: "by_flow",
  },
  {
    table: "userJourneys",
    naturalKey: ["journeyId"],
    upsertIndex: "by_tenant",
  },
  {
    table: "userJourneyVersions",
    naturalKey: ["journeyId", "version"],
    upsertIndex: "by_journey",
  },
  {
    table: "userJourneyRuns",
    naturalKey: ["runId"],
    upsertIndex: "by_run",
  },
  {
    table: "userJourneyRunEvents",
    naturalKey: ["runId", "seq"],
    upsertIndex: "by_run",
  },
  {
    table: "chatEvents",
    naturalKey: ["sessionId", "seq"],
    upsertIndex: "by_session",
  },
  {
    table: "conversations",
    naturalKey: ["conversationId"],
    upsertIndex: "by_conversation",
  },
  {
    table: "conversationEntries",
    naturalKey: ["conversationId", "entryId"],
    upsertIndex: "by_entry",
  },
  {
    table: "conversationTurns",
    naturalKey: ["conversationId", "turnId"],
    upsertIndex: "by_turn",
  },
  {
    table: "conversationCheckpoints",
    naturalKey: ["conversationId", "version"],
    upsertIndex: "by_conversation",
  },
  {
    table: "conversationRuntimeBindings",
    naturalKey: ["conversationId", "runtimeKind"],
    upsertIndex: "by_conversation_runtime",
  },
  {
    table: "conversationAttachments",
    naturalKey: ["conversationId", "attachmentId"],
    upsertIndex: "by_attachment",
  },
  { table: "intents", naturalKey: ["intentId"], upsertIndex: "by_tenant" },
  {
    table: "intentDecisions",
    naturalKey: ["intentId", "seq"],
    upsertIndex: "by_intent",
  },
  { table: "goals", naturalKey: ["goalId"], upsertIndex: "by_tenant" },
  {
    table: "agencyDefinitions",
    naturalKey: ["recordId"],
    upsertIndex: "by_tenant",
  },
  {
    table: "agencyStates",
    naturalKey: ["definitionId"],
    upsertIndex: "by_tenant",
  },
  {
    table: "agencyOutputs",
    naturalKey: ["recordId"],
    upsertIndex: "by_tenant_record",
  },
  { table: "reports", naturalKey: ["slug", "runId"], upsertIndex: "by_slug" },
  { table: "agents", naturalKey: ["slug"], upsertIndex: "by_tenant" },
  { table: "viewRenderers", naturalKey: ["slug"], upsertIndex: "by_tenant" },
  {
    table: "widgets",
    naturalKey: ["slug", "version"],
    upsertIndex: "by_widget",
  },
  { table: "macros", naturalKey: ["macroId"], upsertIndex: "by_tenant" },
  { table: "repoDocs", naturalKey: ["kind"], upsertIndex: "by_kind" },
  {
    table: "knowledgeGraphs",
    naturalKey: [],
    upsertIndex: "by_tenant",
    tenantSingleton: true,
  },
  {
    table: "notificationPrefs",
    naturalKey: ["login"],
    upsertIndex: "by_login",
  },
  {
    table: "userState",
    naturalKey: ["namespace", "userKey"],
    upsertIndex: "by_user",
  },
  {
    table: "userPreferences",
    naturalKey: ["namespace", "userKey"],
    upsertIndex: "by_user",
    global: true,
  },
  {
    table: "agencyRecords",
    naturalKey: ["kind", "recordId"],
    upsertIndex: "by_tenant",
  },
  {
    table: "taskState",
    naturalKey: ["taskKey", "kind"],
    upsertIndex: "by_task",
  },
  { table: "capabilityState", naturalKey: ["slug"], upsertIndex: "by_tenant" },
  {
    table: "dailyLogs",
    naturalKey: ["stream", "date", "seq"],
    upsertIndex: "by_stream",
  },
  { table: "agencyRuns", naturalKey: ["runId"], upsertIndex: "by_run" },
  { table: "runEvents", naturalKey: ["runId", "seq"], upsertIndex: "by_run" },
  { table: "manifests", naturalKey: ["kind"], upsertIndex: "by_kind" },
  {
    table: "inboxEntries",
    naturalKey: ["login", "entryId"],
    upsertIndex: "by_entry",
  },
  { table: "channelsSeen", naturalKey: ["login"], upsertIndex: "by_login" },
  {
    table: "actionStates",
    naturalKey: ["runId"],
    upsertIndex: "by_run",
    global: true,
  },
  { table: "eventLog", naturalKey: ["entryId"], global: true },
];

export const IMPORTABLE_TABLES: readonly string[] = TABLES.map(
  (entry) => entry.table,
);

/** Tables whose rows belong to one repository and are safe to back up or restore there. */
export const REPO_SCOPED_TABLES: readonly string[] = TABLES.filter(
  (entry) => !entry.global,
).map((entry) => entry.table);

/**
 * @fileType utility
 * @domain kody
 * @pattern company-intents-store
 * @ai-summary Convex-backed store for company intents and their decision
 *   logs (intents.{list,get,save,listDecisions,appendDecision}, tenant-scoped
 *   by owner/repo). The API routes call these instead of backend files.
 */
import {
  backendApi,
  getConvexClient,
  tenantIdFor,
} from "./backend/convex-backend";
import {
  companyIntentPath,
  normalizeCompanyIntent,
  parseCompanyIntentDecisionLog,
  sortCompanyIntentRecords,
  type CompanyIntent,
  type CompanyIntentDecisionLog,
  type CompanyIntentRecord,
} from "./company-intents";

interface IntentDoc {
  intentId: string;
  intent: unknown;
}

interface IntentDecisionDoc {
  seq: number;
  decision: unknown;
}

function decisionsFromDocs(
  docs: IntentDecisionDoc[],
): CompanyIntentDecisionLog[] {
  const jsonl = [...docs]
    .sort((a, b) => a.seq - b.seq)
    .map((doc) => JSON.stringify(doc.decision))
    .join("\n");
  return parseCompanyIntentDecisionLog(jsonl);
}

async function listIntentDecisions(
  owner: string,
  repo: string,
  intentId: string,
): Promise<CompanyIntentDecisionLog[]> {
  const docs = (await getConvexClient().query(
    backendApi.intents.listDecisions,
    { tenantId: tenantIdFor(owner, repo), intentId },
  )) as IntentDecisionDoc[];
  return decisionsFromDocs(docs);
}

function toRecord(
  doc: IntentDoc,
  decisions: CompanyIntentDecisionLog[],
): CompanyIntentRecord {
  const path = companyIntentPath(doc.intentId);
  return {
    id: doc.intentId,
    path,
    intent: normalizeCompanyIntent(path, doc.intent),
    decisions,
  };
}

/** All intents for the repo, priority-sorted, with decision logs attached. */
export async function listCompanyIntentRecords(
  owner: string,
  repo: string,
): Promise<CompanyIntentRecord[]> {
  const docs = (await getConvexClient().query(backendApi.intents.list, {
    tenantId: tenantIdFor(owner, repo),
  })) as IntentDoc[];
  const records = await Promise.all(
    docs.map(async (doc) =>
      toRecord(doc, await listIntentDecisions(owner, repo, doc.intentId)),
    ),
  );
  return sortCompanyIntentRecords(records);
}

/** One intent record (with decisions), or null when it doesn't exist. */
export async function readCompanyIntentRecord(
  owner: string,
  repo: string,
  id: string,
): Promise<CompanyIntentRecord | null> {
  const doc = (await getConvexClient().query(backendApi.intents.get, {
    tenantId: tenantIdFor(owner, repo),
    intentId: id,
  })) as IntentDoc | null;
  if (!doc) return null;
  return toRecord(doc, await listIntentDecisions(owner, repo, id));
}

/** Create or update an intent document. */
export async function saveCompanyIntent(
  owner: string,
  repo: string,
  intent: CompanyIntent,
): Promise<void> {
  await getConvexClient().mutation(backendApi.intents.save, {
    tenantId: tenantIdFor(owner, repo),
    intentId: intent.id,
    intent,
    updatedAt: intent.updatedAt,
  });
}

/** Append one decision-log entry to an intent's aggregate. */
export async function appendCompanyIntentDecision(
  owner: string,
  repo: string,
  intentId: string,
  decision: CompanyIntentDecisionLog,
): Promise<void> {
  await getConvexClient().mutation(backendApi.intents.appendDecision, {
    tenantId: tenantIdFor(owner, repo),
    intentId,
    decision,
  });
}

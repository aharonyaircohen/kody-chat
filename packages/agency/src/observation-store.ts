import type { Octokit } from "@octokit/rest";

import {
  listStateDirectory,
  readStateText,
} from "@kody-ade/base/state-repo";
import {
  agencyStateSchema,
  type AgencyStateModel,
  type Finding,
  type Learning,
  type Observation,
} from "./observation-state";

export type AgencyStateRecord = Observation | Finding | Learning;

export interface AgencyStatePayload {
  model: AgencyStateModel;
  records: AgencyStateRecord[];
  invalidCount: number;
  computedAt: string;
}

function recordTime(record: AgencyStateRecord): string {
  if ("updatedAt" in record) return record.updatedAt;
  if ("createdAt" in record) return record.createdAt;
  return record.observedAt;
}

export async function listAgencyState({
  octokit,
  owner,
  repo,
  model,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  model: AgencyStateModel;
}): Promise<AgencyStatePayload> {
  let entries: Awaited<ReturnType<typeof listStateDirectory>>["entries"] = [];
  try {
    ({ entries } = await listStateDirectory(
      octokit,
      owner,
      repo,
      `agency/${model}`,
    ));
  } catch (error: unknown) {
    const status =
      typeof error === "object" && error && "status" in error
        ? Number(error.status)
        : null;
    if (status !== 404) throw error;
  }

  const jsonEntries = entries.filter(
    (entry) => entry.type === "file" && entry.name.endsWith(".json"),
  );
  const files = await Promise.all(
    jsonEntries.map((entry) =>
      readStateText(octokit, owner, repo, `agency/${model}/${entry.name}`),
    ),
  );
  const schema = agencyStateSchema(model);
  const records: AgencyStateRecord[] = [];
  let invalidCount = 0;

  for (const file of files) {
    if (!file) continue;
    try {
      const parsed = schema.safeParse(JSON.parse(file.content));
      if (parsed.success) records.push(parsed.data as AgencyStateRecord);
      else invalidCount += 1;
    } catch {
      invalidCount += 1;
    }
  }

  records.sort((a, b) => {
    return Date.parse(recordTime(b)) - Date.parse(recordTime(a));
  });

  return {
    model,
    records,
    invalidCount,
    computedAt: new Date().toISOString(),
  };
}

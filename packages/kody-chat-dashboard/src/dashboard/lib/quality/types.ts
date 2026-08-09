import type {
  QualityAction,
  QualityJourney,
  QualityRunStatus,
  QualityScenario,
} from "./contracts";

export type QualityRun = {
  runId: string;
  runSlug: string;
  journeySlug: string;
  scenarioSlug: string;
  environment: string;
  targetUrl: string;
  sourceCommit: string;
  definitionUpdatedAt: string;
  retryOfRunId?: string;
  status: QualityRunStatus;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
  latestEvent?: {
    type?: string;
    summary?: string;
    artifactPath?: string;
    artifactUrl?: string;
    passed?: number;
    failed?: number;
  };
};

export type QualityMap = {
  actions: QualityAction[];
  journeys: QualityJourney[];
  scenarios: QualityScenario[];
  runs: QualityRun[];
  currentSourceCommit: string | null;
};

export type QualityResource = "actions" | "journeys" | "scenarios" | "runs";
export type QualityRecord =
  QualityAction | QualityJourney | QualityScenario | QualityRun;

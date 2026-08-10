"use client";

import { useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  ExternalLink,
  Footprints,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Zap,
} from "lucide-react";

import { Button } from "@kody-ade/base/ui/button";
import { repoScopedHref } from "@kody-ade/base/routes";
import { resolveEnvironments } from "@kody-ade/fly/preview-environments";
import { AuthGuard } from "../auth-guard";
import { buildAuthHeaders, useAuth } from "../auth-context";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { MasterDetailShell } from "../components/MasterDetailShell";
import { selectionPath } from "../selection-routing";
import type {
  QualityAction,
  QualityJourney,
  QualityScenario,
} from "./contracts";
import { qualityRunHealth } from "./contracts";
import { QualityEditorDialog } from "./QualityEditorDialog";
import { QualityRunDialog } from "./QualityRunDialog";
import type { QualityMap, QualityRecord, QualityResource } from "./types";
import { cn } from "../utils";

const CONFIG = {
  actions: {
    title: "Actions",
    singular: "Action",
    icon: Zap,
    empty: "No Actions yet",
    hint: "Add a reusable user action to start mapping product quality.",
  },
  journeys: {
    title: "Journeys",
    singular: "Journey",
    icon: Footprints,
    empty: "No Journeys yet",
    hint: "Combine Actions into an end-to-end user goal.",
  },
  scenarios: {
    title: "Scenarios",
    singular: "Scenario",
    icon: ShieldCheck,
    empty: "No Scenarios yet",
    hint: "Add a meaningful variation and define the proof it needs.",
  },
  runs: {
    title: "Quality Runs",
    singular: "Quality Run",
    icon: Activity,
    empty: "No Quality Runs yet",
    hint: "Run an active Scenario to create durable quality evidence.",
  },
} as const;

function recordSlug(record: QualityRecord): string {
  return "runSlug" in record ? record.runSlug : record.slug;
}

function recordName(record: QualityRecord, map: QualityMap): string {
  if (!("runSlug" in record)) return record.name;
  return (
    map.scenarios.find((scenario) => scenario.slug === record.scenarioSlug)
      ?.name ?? record.runSlug
  );
}

function recordSummary(record: QualityRecord, map: QualityMap): string {
  if ("outcome" in record) return record.outcome;
  if ("goal" in record) return record.goal;
  if ("given" in record)
    return `${record.kind} · ${scenarioHealth(record, map).replaceAll("_", " ")}`;
  return `${record.environment} · ${record.status}`;
}

function scenarioHealth(scenario: QualityScenario, map: QualityMap) {
  const latest = map.runs.find(
    (run) => run.scenarioSlug === scenario.slug && !run.archived,
  );
  return qualityRunHealth({
    scenarioStatus: scenario.status,
    scenarioUpdatedAt: scenario.updatedAt,
    latestRun: latest ?? null,
    targetCommit: map.currentSourceCommit,
    hasTest: scenarioExecutable(scenario, map),
  });
}

function scenarioExecutable(scenario: QualityScenario, map: QualityMap) {
  const journey = map.journeys.find(
    (candidate) => candidate.slug === scenario.journeySlug,
  );
  return Boolean(
    scenario.environmentId &&
    journey?.status === "active" &&
    journey?.actionSlugs.length &&
    journey.actionSlugs.every((slug) => {
      const action = map.actions.find((candidate) => candidate.slug === slug);
      return action?.status === "active";
    }),
  );
}

function displayLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function toneFor(value: string): string {
  switch (value) {
    case "active":
    case "passed":
    case "passing":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
    case "failed":
    case "failing":
      return "border-red-500/25 bg-red-500/10 text-red-300";
    case "blocked":
    case "critical":
      return "border-amber-500/25 bg-amber-500/10 text-amber-300";
    case "running":
      return "border-cyan-500/25 bg-cyan-500/10 text-cyan-300";
    default:
      return "border-white/10 bg-white/[0.04] text-muted-foreground";
  }
}

function QualityBadge({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        toneFor(value),
      )}
    >
      {displayLabel(value)}
    </span>
  );
}

function DetailCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 md:p-5">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function DetailValue({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-1 whitespace-pre-wrap break-words text-sm text-foreground",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

async function readQuality(
  resource: QualityResource,
  headers: Record<string, string>,
): Promise<QualityMap> {
  const [response, configResponse] = await Promise.all([
    fetch(`/api/kody/quality/${resource}`, { headers, cache: "no-store" }),
    fetch("/api/kody/dashboard-config", { headers, cache: "no-store" }),
  ]);
  const payload = (await response.json()) as Partial<QualityMap> & {
    error?: string;
  };
  if (!response.ok) throw new Error(payload.error ?? "Unable to load Quality");
  const configPayload = configResponse.ok
    ? ((await configResponse.json()) as {
        config?: Parameters<typeof resolveEnvironments>[0];
      })
    : null;
  return {
    actions: payload.actions ?? [],
    journeys: payload.journeys ?? [],
    scenarios: payload.scenarios ?? [],
    runs: payload.runs ?? [],
    currentSourceCommit: payload.currentSourceCommit ?? null,
    environments: resolveEnvironments(configPayload?.config),
  };
}

function recordsFor(
  resource: QualityResource,
  map: QualityMap,
): QualityRecord[] {
  return resource === "actions"
    ? map.actions
    : resource === "journeys"
      ? map.journeys
      : resource === "scenarios"
        ? map.scenarios
        : map.runs;
}

function Detail({
  record,
  map,
  onBack,
  onEdit,
  onDelete,
  onRun,
  onArchive,
}: {
  record: QualityRecord;
  map: QualityMap;
  onBack: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onRun?: () => void;
  onArchive?: () => void;
}) {
  const Icon =
    "outcome" in record
      ? Zap
      : "goal" in record
        ? Footprints
        : "given" in record
          ? ShieldCheck
          : Activity;
  const status = record.status;
  const scenario =
    "runSlug" in record
      ? map.scenarios.find(
          (candidate) => candidate.slug === record.scenarioSlug,
        )
      : null;
  return (
    <article className="min-h-full">
      <div className="border-b border-white/[0.06] bg-gradient-to-b from-cyan-500/[0.06] via-cyan-500/[0.02] to-transparent">
        <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="-ml-2 gap-1 text-muted-foreground md:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <header className="flex flex-col items-start gap-4">
            <div className="min-w-0 w-full">
              <div className="flex min-w-0 items-center gap-2.5">
                <Icon className="h-5 w-5 shrink-0 text-cyan-300" />
                <h2 className="min-w-0 break-words text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                  {recordName(record, map)}
                </h2>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{recordSlug(record)}</span>
                <span>·</span>
                <QualityBadge value={status} />
                {"given" in record ? (
                  <QualityBadge value={scenarioHealth(record, map)} />
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {onRun ? (
                <Button size="sm" onClick={onRun}>
                  <Play className="h-4 w-4" />
                  Run
                </Button>
              ) : null}
              {onEdit ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onEdit}
                  aria-label={`Edit ${recordName(record, map)}`}
                >
                  <Pencil className="h-4 w-4" />
                  <span className="hidden sm:inline">Edit</span>
                </Button>
              ) : null}
              {onArchive ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onArchive}
                  aria-label={
                    "runSlug" in record && record.archived
                      ? "Restore"
                      : "Archive"
                  }
                >
                  {"runSlug" in record && record.archived ? (
                    <ArchiveRestore className="h-4 w-4" />
                  ) : (
                    <Archive className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">
                    {"runSlug" in record && record.archived
                      ? "Restore"
                      : "Archive"}
                  </span>
                </Button>
              ) : null}
              {onDelete ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-400 hover:text-red-300"
                  onClick={onDelete}
                  aria-label={`Delete ${recordName(record, map)}`}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Delete</span>
                </Button>
              ) : null}
            </div>
          </header>
        </div>
      </div>
      <div className="mx-auto grid max-w-4xl gap-4 p-4 md:p-8">
        {"outcome" in record ? (
          <>
            <DetailCard title="User outcome">
              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                {record.outcome}
              </p>
            </DetailCard>
            <DetailCard title="Details">
              <dl className="grid gap-4 sm:grid-cols-2">
                <DetailValue label="Product area" value={record.area} />
                <DetailValue
                  label="Status"
                  value={displayLabel(record.status)}
                />
              </dl>
            </DetailCard>
          </>
        ) : "goal" in record ? (
          <>
            <DetailCard title="User goal">
              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                {record.goal}
              </p>
            </DetailCard>
            <DetailCard title="Actions">
              {record.actionSlugs.length ? (
                <ol className="grid gap-2">
                  {record.actionSlugs.map((slug, index) => (
                    <li
                      key={slug}
                      className="flex items-center gap-3 rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2.5"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-xs font-medium text-cyan-300">
                        {index + 1}
                      </span>
                      <span className="min-w-0 truncate text-sm">
                        {map.actions.find((action) => action.slug === slug)
                          ?.name ?? slug}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">No Actions</p>
              )}
            </DetailCard>
            <DetailCard title="Details">
              <dl className="grid gap-4 sm:grid-cols-2">
                <DetailValue label="Priority" value={record.priority} />
                <DetailValue
                  label="Status"
                  value={displayLabel(record.status)}
                />
              </dl>
            </DetailCard>
          </>
        ) : "given" in record ? (
          <>
            <DetailCard title="Scenario">
              <dl className="grid gap-4 sm:grid-cols-2">
                <DetailValue
                  label="Journey"
                  value={
                    map.journeys.find(
                      (journey) => journey.slug === record.journeySlug,
                    )?.name ?? record.journeySlug
                  }
                />
                <DetailValue label="Kind" value={record.kind} />
              </dl>
            </DetailCard>
            <DetailCard title="Starting conditions">
              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                {record.given}
              </p>
            </DetailCard>
            <DetailCard title="Required proof">
              <dl className="grid gap-5 sm:grid-cols-2">
                <DetailValue
                  label="Visible result"
                  value={record.expectedVisible}
                />
                <DetailValue
                  label="Stored state"
                  value={record.expectedState}
                />
              </dl>
            </DetailCard>
            <DetailCard title="Execution">
              <dl className="grid gap-4 sm:grid-cols-2">
                <DetailValue
                  label="Environment"
                  value={
                    map.environments.find(
                      (environment) => environment.id === record.environmentId,
                    )?.label ?? "Not selected"
                  }
                />
                <DetailValue label="Cleanup" value={record.cleanup || "None"} />
              </dl>
            </DetailCard>
          </>
        ) : (
          <>
            <DetailCard title="Result">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    {record.status === "passed" ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                    ) : (
                      <CircleDot className="h-5 w-5 text-cyan-300" />
                    )}
                    <span className="text-lg font-medium capitalize text-foreground">
                      {displayLabel(record.status)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {record.latestEvent?.summary ?? "Waiting for a result."}
                  </p>
                </div>
                {record.latestEvent ? (
                  <div className="rounded-lg border border-white/[0.08] bg-black/20 px-4 py-2 text-sm">
                    {typeof record.latestEvent.passed === "number" &&
                    typeof record.latestEvent.failed === "number" ? (
                      <>
                        <span className="text-emerald-300">
                          {record.latestEvent.passed} passed
                        </span>
                        <span className="mx-2 text-muted-foreground">·</span>
                        <span
                          className={
                            record.latestEvent.failed
                              ? "text-red-300"
                              : "text-muted-foreground"
                          }
                        >
                          {record.latestEvent.failed} failed
                        </span>
                        {record.latestEvent.blocked ? (
                          <>
                            <span className="mx-2 text-muted-foreground">
                              ·
                            </span>
                            <span className="text-amber-300">
                              {record.latestEvent.blocked} blocked
                            </span>
                          </>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        Results unavailable
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
              {record.latestEvent?.actionResults?.length ? (
                <div className="mt-5 divide-y divide-white/[0.08] border-y border-white/[0.08]">
                  {record.latestEvent.actionResults.map((result) => (
                    <div
                      key={result.actionSlug}
                      className="flex items-start gap-3 py-3"
                    >
                      {result.status === "passed" ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                      ) : (
                        <CircleDot
                          className={cn(
                            "mt-0.5 h-4 w-4 shrink-0",
                            result.status === "failed"
                              ? "text-red-300"
                              : "text-amber-300",
                          )}
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {result.actionName}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {result.evidence}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {record.latestEvent?.artifactUrl ? (
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <a
                    href={record.latestEvent.artifactUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Quality evidence
                  </a>
                </Button>
              ) : null}
            </DetailCard>
            <DetailCard title="Run details">
              <dl className="grid gap-4 sm:grid-cols-2">
                <DetailValue
                  label="Scenario"
                  value={scenario?.name ?? record.scenarioSlug}
                />
                <DetailValue label="Environment" value={record.environment} />
                <DetailValue label="Target" value={record.targetUrl} mono />
                <DetailValue
                  label="Source commit"
                  value={record.sourceCommit}
                  mono
                />
                <DetailValue
                  label="Evidence path"
                  value={record.latestEvent?.artifactPath ?? "Pending"}
                  mono={!!record.latestEvent?.artifactPath}
                />
                <DetailValue label="Error" value={record.error ?? "None"} />
              </dl>
            </DetailCard>
          </>
        )}
      </div>
    </article>
  );
}

function QualityRow({
  record,
  map,
  active,
  onSelect,
}: {
  record: QualityRecord;
  map: QualityMap;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon =
    "outcome" in record
      ? Zap
      : "goal" in record
        ? Footprints
        : "given" in record
          ? ShieldCheck
          : Activity;
  const badge =
    "given" in record
      ? scenarioHealth(record, map)
      : "goal" in record
        ? record.priority
        : record.status;
  return (
    <button
      type="button"
      className={cn(
        "relative block w-full px-4 py-3 text-left transition-colors hover:bg-accent/50",
        active && "bg-cyan-500/10",
      )}
      onClick={onSelect}
    >
      {active ? (
        <span className="absolute inset-y-0 left-0 w-0.5 bg-cyan-400" />
      ) : null}
      <div className="flex min-w-0 items-start gap-3">
        <Icon
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            active ? "text-cyan-300" : "text-muted-foreground",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <span className="truncate text-sm font-medium text-foreground">
              {recordName(record, map)}
            </span>
            <QualityBadge value={badge} />
          </div>
          <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {recordSummary(record, map)}
          </p>
        </div>
      </div>
    </button>
  );
}

function QualityResourceManager({ resource }: { resource: QualityResource }) {
  const { auth } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<QualityRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<QualityRecord | null>(null);
  const [archiving, setArchiving] = useState<QualityRecord | null>(null);
  const [leavingArchivedRun, setLeavingArchivedRun] = useState(false);
  const [startingRun, setStartingRun] = useState(
    resource === "runs" && !!searchParams.get("scenario"),
  );
  const headers = useMemo(() => (auth ? buildAuthHeaders(auth) : {}), [auth]);
  const basePath = `/quality/${resource}`;
  const canonicalBasePath = auth ? repoScopedHref(auth, basePath) : basePath;
  const showArchived = searchParams.get("archived") === "1";
  const selectionMarker = `${basePath}/`;
  const selectionIndex = pathname.indexOf(selectionMarker);
  const selectedSlug =
    selectionIndex >= 0
      ? decodeURIComponent(
          pathname
            .slice(selectionIndex + selectionMarker.length)
            .split("/")[0] ?? "",
        )
      : "";
  const query = useQuery({
    queryKey: ["quality", auth?.owner, auth?.repo],
    queryFn: () => readQuality(resource, headers),
    enabled: !!auth,
  });
  const map = query.data ?? {
    actions: [],
    journeys: [],
    scenarios: [],
    runs: [],
    currentSourceCommit: null,
    environments: [],
  };
  const records = recordsFor(resource, map).filter(
    (record) =>
      resource !== "runs" ||
      showArchived ||
      !("runSlug" in record && record.archived),
  );
  const selected =
    records.find((record) => recordSlug(record) === selectedSlug) ?? null;
  const filtered = records.filter((record) =>
    `${recordName(record, map)} ${recordSummary(record, map)}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const save = useMutation({
    mutationFn: async (
      record: QualityAction | QualityJourney | QualityScenario,
    ) => {
      const response = await fetch(`/api/kody/quality/${resource}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(record),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Unable to save");
      return record;
    },
    onSuccess: async (record) => {
      setCreating(false);
      setEditing(null);
      await queryClient.invalidateQueries({
        queryKey: ["quality", auth?.owner, auth?.repo],
      });
      router.push(selectionPath(canonicalBasePath, record.slug));
      toast.success(`${CONFIG[resource].singular} saved`);
    },
    onError: (error: Error) =>
      toast.error("Could not save", { description: error.message }),
  });
  const remove = useMutation({
    mutationFn: async (record: QualityRecord) => {
      const response = await fetch(
        `/api/kody/quality/${resource}/${encodeURIComponent(recordSlug(record))}`,
        { method: "DELETE", headers },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Unable to delete");
      }
    },
    onSuccess: async () => {
      setDeleting(null);
      router.push(canonicalBasePath);
      await queryClient.invalidateQueries({
        queryKey: ["quality", auth?.owner, auth?.repo],
      });
      toast.success(`${CONFIG[resource].singular} deleted`);
    },
    onError: (error: Error) =>
      toast.error("Could not delete", { description: error.message }),
  });
  const setArchived = useMutation({
    mutationFn: async (record: QualityRecord) => {
      if (!("runSlug" in record)) {
        throw new Error("Only Quality Runs can be archived");
      }
      const archived = !record.archived;
      const response = await fetch(
        `/api/kody/quality/runs/${encodeURIComponent(record.runSlug)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ runId: record.runId, archived }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update Quality Run");
      }
      return { record, archived };
    },
    onSuccess: async (result) => {
      setArchiving(null);
      if (result.archived) {
        setLeavingArchivedRun(true);
        router.push(canonicalBasePath);
      }
      await queryClient.invalidateQueries({
        queryKey: ["quality", auth?.owner, auth?.repo],
      });
      toast.success(
        result.archived ? "Quality Run archived" : "Quality Run restored",
      );
    },
    onError: (error: Error) =>
      toast.error("Could not update Quality Run", {
        description: error.message,
      }),
  });
  const run = useMutation({
    mutationFn: async (scenarioSlug: string) => {
      const response = await fetch("/api/kody/quality/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ scenarioSlug }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        runSlug?: string;
      };
      if (!response.ok || !payload.runSlug) {
        throw new Error(payload.error ?? "Unable to start Quality Run");
      }
      return payload.runSlug;
    },
    onSuccess: async (runSlug) => {
      setStartingRun(false);
      await queryClient.invalidateQueries({
        queryKey: ["quality", auth?.owner, auth?.repo],
      });
      router.push(
        selectionPath(
          auth ? repoScopedHref(auth, "/quality/runs") : "/quality/runs",
          runSlug,
        ),
      );
      toast.success("Quality Run started");
    },
    onError: (error: Error) =>
      toast.error("Could not start Quality Run", {
        description: error.message,
      }),
  });

  const config = CONFIG[resource];
  return (
    <>
      <MasterDetailShell
        title={config.title}
        icon={config.icon}
        iconClassName="text-cyan-400"
        subtitle={`${records.length} ${records.length === 1 ? config.singular.toLowerCase() : config.title.toLowerCase()}`}
        search={search}
        onSearch={setSearch}
        searchPlaceholder={`Search ${resource}…`}
        searchAriaLabel={`Search ${resource}`}
        accent="teal"
        listAside={
          resource === "runs" ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full justify-start text-muted-foreground"
              aria-pressed={showArchived}
              aria-label={showArchived ? "Hide archived" : "Show archived"}
              disabled={leavingArchivedRun}
              onClick={() =>
                router.replace(
                  showArchived ? canonicalBasePath : `${pathname}?archived=1`,
                )
              }
            >
              <Archive className="mr-1.5 h-4 w-4" />
              {showArchived ? "Hide archived" : "Show archived"}
            </Button>
          ) : undefined
        }
        listWidth="md:w-72"
        hasSelection={!!selected}
        actions={
          resource === "runs" ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="w-9 px-0"
                onClick={() => void query.refetch()}
                disabled={query.isFetching}
                aria-label="Refresh Quality Runs"
              >
                <RefreshCw
                  className={cn("h-4 w-4", query.isFetching && "animate-spin")}
                />
              </Button>
              <Button
                size="sm"
                className="w-9 px-0 sm:w-auto sm:px-3"
                aria-label="New Quality Run"
                onClick={() => setStartingRun(true)}
              >
                <Play className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">New Quality Run</span>
              </Button>
            </div>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className="w-9 px-0"
                onClick={() => void query.refetch()}
                disabled={query.isFetching}
                aria-label={`Refresh ${config.title}`}
              >
                <RefreshCw
                  className={cn("h-4 w-4", query.isFetching && "animate-spin")}
                />
              </Button>
              <Button
                size="sm"
                className="w-9 px-0 sm:w-auto sm:px-3"
                onClick={() => setCreating(true)}
                aria-label={`New ${config.singular.toLowerCase()}`}
              >
                <Plus className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">
                  New {config.singular.toLowerCase()}
                </span>
              </Button>
            </>
          )
        }
        error={
          query.error instanceof Error
            ? `Failed to load ${config.title.toLowerCase()}: ${query.error.message}`
            : null
        }
        detail={
          selected ? (
            <Detail
              record={selected}
              map={map}
              onBack={() => router.push(canonicalBasePath)}
              onEdit={
                resource === "runs" ? undefined : () => setEditing(selected)
              }
              onDelete={
                resource === "runs" ? undefined : () => setDeleting(selected)
              }
              onArchive={
                resource === "runs" ? () => setArchiving(selected) : undefined
              }
              onRun={
                resource === "scenarios" &&
                "journeySlug" in selected &&
                selected.status === "active" &&
                scenarioExecutable(selected, map)
                  ? () =>
                      router.push(
                        `${auth ? repoScopedHref(auth, "/quality/runs") : "/quality/runs"}?scenario=${encodeURIComponent(selected.slug)}`,
                      )
                  : undefined
              }
            />
          ) : (
            <EmptyState
              icon={<config.icon />}
              title={`Select ${config.singular.toLowerCase()}`}
              hint={`Pick one from the list to inspect its ${resource === "runs" ? "result and evidence" : "details"}.`}
            />
          )
        }
      >
        {query.isLoading ? (
          <EmptyState
            icon={<config.icon />}
            title={`Loading ${config.title}...`}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<config.icon />}
            title={search ? `No matching ${config.title}` : config.empty}
            hint={search ? `Nothing matched “${search}”.` : config.hint}
            action={
              !search && resource !== "runs" ? (
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4" />
                  New {config.singular.toLowerCase()}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((record) => (
              <li key={recordSlug(record)}>
                <QualityRow
                  record={record}
                  map={map}
                  active={recordSlug(record) === selectedSlug}
                  onSelect={() => {
                    const destination = selectionPath(
                      canonicalBasePath,
                      recordSlug(record),
                    );
                    router.push(
                      "runSlug" in record && record.archived
                        ? `${destination}?archived=1`
                        : destination,
                    );
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </MasterDetailShell>
      {resource !== "runs" ? (
        <QualityEditorDialog
          resource={resource}
          open={creating || !!editing}
          record={editing}
          map={map}
          saving={save.isPending}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={async (record) => {
            await save.mutateAsync(record);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting ? recordName(deleting, map) : config.singular}?`}
        description="This is allowed only when nothing depends on it."
        confirmLabel="Delete"
        variant="destructive"
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting);
        }}
      />
      <ConfirmDialog
        open={!!archiving}
        title={`${archiving && "runSlug" in archiving && archiving.archived ? "Restore" : "Archive"} ${archiving ? recordName(archiving, map) : "Quality Run"}?`}
        description={
          archiving && "runSlug" in archiving && archiving.archived
            ? "This run will return to the normal list."
            : "This run will leave the normal list. Its result and evidence will be kept."
        }
        confirmLabel={
          archiving && "runSlug" in archiving && archiving.archived
            ? "Restore"
            : "Archive"
        }
        onClose={() => setArchiving(null)}
        onConfirm={() => {
          if (archiving) setArchived.mutate(archiving);
        }}
      />
      {resource === "runs" ? (
        <QualityRunDialog
          open={startingRun}
          map={map}
          initialScenario={searchParams.get("scenario") ?? undefined}
          running={run.isPending}
          onClose={() => setStartingRun(false)}
          onRun={async (scenarioSlug) => {
            await run.mutateAsync(scenarioSlug);
          }}
        />
      ) : null}
    </>
  );
}

export function QualityResourcePage({
  resource,
}: {
  resource: QualityResource;
}) {
  return (
    <AuthGuard>
      <QualityResourceManager resource={resource} />
    </AuthGuard>
  );
}

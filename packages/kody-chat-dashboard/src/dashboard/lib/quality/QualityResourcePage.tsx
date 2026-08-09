"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  Footprints,
  Pencil,
  Play,
  Plus,
  ShieldCheck,
  Trash2,
  Zap,
} from "lucide-react";

import { Button } from "@kody-ade/base/ui/button";
import { repoScopedHref } from "@kody-ade/base/routes";
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

const CONFIG = {
  actions: {
    title: "Actions",
    singular: "Action",
    icon: Zap,
    empty: "No Actions yet",
  },
  journeys: {
    title: "Journeys",
    singular: "Journey",
    icon: Footprints,
    empty: "No Journeys yet",
  },
  scenarios: {
    title: "Scenarios",
    singular: "Scenario",
    icon: ShieldCheck,
    empty: "No Scenarios yet",
  },
  runs: {
    title: "Quality Runs",
    singular: "Quality Run",
    icon: Activity,
    empty: "No Quality Runs yet",
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
  const latest = map.runs.find((run) => run.scenarioSlug === scenario.slug);
  return qualityRunHealth({
    scenarioStatus: scenario.status,
    scenarioUpdatedAt: scenario.updatedAt,
    latestRun: latest ?? null,
    targetCommit: map.currentSourceCommit,
    hasTest: !!scenario.testId,
  });
}

async function readQuality(
  resource: QualityResource,
  headers: Record<string, string>,
): Promise<QualityMap> {
  const response = await fetch(`/api/kody/quality/${resource}`, {
    headers,
    cache: "no-store",
  });
  const payload = (await response.json()) as Partial<QualityMap> & {
    error?: string;
  };
  if (!response.ok) throw new Error(payload.error ?? "Unable to load Quality");
  return {
    actions: payload.actions ?? [],
    journeys: payload.journeys ?? [],
    scenarios: payload.scenarios ?? [],
    runs: payload.runs ?? [],
    currentSourceCommit: payload.currentSourceCommit ?? null,
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
  onEdit,
  onDelete,
  onRun,
}: {
  record: QualityRecord;
  map: QualityMap;
  onEdit?: () => void;
  onDelete?: () => void;
  onRun?: () => void;
}) {
  const fields: Array<[string, string]> =
    "outcome" in record
      ? [
          ["User outcome", record.outcome],
          ["Product area", record.area],
          ["Status", record.status],
        ]
      : "goal" in record
        ? [
            ["User goal", record.goal],
            ["Priority", record.priority],
            [
              "Actions",
              record.actionSlugs
                .map(
                  (slug) =>
                    map.actions.find((action) => action.slug === slug)?.name ??
                    slug,
                )
                .join(" → ") || "No Actions",
            ],
            ["Status", record.status],
          ]
        : "given" in record
          ? [
              [
                "Journey",
                map.journeys.find(
                  (journey) => journey.slug === record.journeySlug,
                )?.name ?? record.journeySlug,
              ],
              ["Kind", record.kind],
              ["Starting conditions", record.given],
              ["Visible proof", record.expectedVisible],
              ["Stored-state proof", record.expectedState],
              ["Executable test", record.testId ?? "Uncovered"],
              ["Cleanup", record.cleanup || "None"],
              ["Status", record.status],
              ["Health", scenarioHealth(record, map).replaceAll("_", " ")],
            ]
          : [
              [
                "Scenario",
                map.scenarios.find(
                  (scenario) => scenario.slug === record.scenarioSlug,
                )?.name ?? record.scenarioSlug,
              ],
              ["Environment", record.environment],
              ["Target", record.targetUrl],
              ["Source commit", record.sourceCommit],
              ["Status", record.status],
              ["Evidence", record.latestEvent?.artifactPath ?? "Pending"],
              ["Evidence URL", record.latestEvent?.artifactUrl ?? "Pending"],
              [
                "Tests",
                record.latestEvent
                  ? `${record.latestEvent.passed ?? 0} passed · ${record.latestEvent.failed ?? 0} failed`
                  : "Pending",
              ],
              ["Summary", record.latestEvent?.summary ?? "Pending"],
              ["Error", record.error ?? "None"],
            ];
  return (
    <div className="p-5 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{recordName(record, map)}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {recordSlug(record)}
          </p>
        </div>
        <div className="flex gap-2">
          {onRun ? (
            <Button size="sm" onClick={onRun}>
              <Play className="mr-1.5 h-4 w-4" />
              Quality Run
            </Button>
          ) : null}
          {onEdit ? (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="mr-1.5 h-4 w-4" />
              Edit
            </Button>
          ) : null}
          {onDelete ? (
            <Button variant="destructive" size="sm" onClick={onDelete}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
          ) : null}
        </div>
      </div>
      <dl className="mt-8 grid gap-5">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm">{value}</dd>
          </div>
        ))}
      </dl>
      {"runSlug" in record && record.latestEvent?.artifactUrl ? (
        <Button asChild variant="outline" className="mt-6">
          <a
            href={record.latestEvent.artifactUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open Quality evidence
          </a>
        </Button>
      ) : null}
    </div>
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
  const [startingRun, setStartingRun] = useState(
    resource === "runs" && !!searchParams.get("scenario"),
  );
  const headers = useMemo(() => (auth ? buildAuthHeaders(auth) : {}), [auth]);
  const basePath = `/quality/${resource}`;
  const canonicalBasePath = auth ? repoScopedHref(auth, basePath) : basePath;
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
  };
  const records = recordsFor(resource, map);
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
        iconClassName="text-cyan-300"
        search={search}
        onSearch={setSearch}
        searchPlaceholder={`Search ${resource}...`}
        searchAriaLabel={`Search ${resource}`}
        accent="teal"
        hasSelection={!!selected}
        actions={
          resource === "runs" ? (
            <Button size="sm" onClick={() => setStartingRun(true)}>
              <Play className="mr-1.5 h-4 w-4" />
              New Quality Run
            </Button>
          ) : (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New {config.singular.toLowerCase()}
            </Button>
          )
        }
        error={query.error instanceof Error ? query.error.message : null}
        detail={
          selected ? (
            <Detail
              record={selected}
              map={map}
              onEdit={
                resource === "runs" ? undefined : () => setEditing(selected)
              }
              onDelete={
                resource === "runs" ? undefined : () => setDeleting(selected)
              }
              onRun={
                resource === "scenarios" &&
                "testId" in selected &&
                selected.status === "active"
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
          />
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((record) => (
              <li key={recordSlug(record)}>
                <Button
                  type="button"
                  variant="ghost"
                  size="clear"
                  className="w-full px-4 py-3 text-left"
                  onClick={() =>
                    router.push(
                      selectionPath(canonicalBasePath, recordSlug(record)),
                    )
                  }
                >
                  <span className="block truncate text-sm font-medium">
                    {recordName(record, map)}
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {recordSummary(record, map)}
                  </span>
                </Button>
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

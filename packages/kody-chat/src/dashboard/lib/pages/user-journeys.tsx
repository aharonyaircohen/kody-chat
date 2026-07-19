"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Clock3, Loader2, Plus, Play, RefreshCw, XCircle } from "lucide-react";
import { repoScopedHref } from "@kody-ade/base/routes";
import { Button } from "@kody-ade/base/ui/button";
import { AuthGuard } from "../auth-guard";
import { buildAuthHeaders, useAuth } from "@dashboard/lib/auth-context";
import { EmptyState } from "../components/EmptyState";
import { PageShell } from "../components/PageShell";
import type { JourneyDefinition } from "../user-journeys/contracts";

type Health = "never_run" | "running" | "passed" | "failed" | "flaky";
type JourneySummary = {
  journeyId: string;
  name: string;
  goal: string;
  status: JourneyDefinition["status"];
  priority: JourneyDefinition["priority"];
  currentVersion: number;
  updatedAt: string;
  health: Health;
  latestRun: { runId: string; status: string; environment: string } | null;
};

const HEALTH_LABEL: Record<Health, string> = {
  never_run: "Never run",
  running: "Running",
  passed: "Passing",
  failed: "Failing",
  flaky: "Flaky",
};

const INITIAL_DEFINITION: JourneyDefinition = {
  id: "new-journey",
  name: "",
  goal: "",
  status: "draft",
  priority: "normal",
  scenarios: [
    {
      id: "happy-path",
      name: "Happy path",
      kind: "happy",
      steps: [
        {
          id: "first-step",
          explanation: "Open the starting screen.",
          action: { type: "navigate", url: "/" },
          assertions: [{ type: "visible", locator: { by: "role", role: "heading", name: "Dashboard" } }],
        },
      ],
    },
  ],
};

function statusIcon(health: Health) {
  if (health === "passed") return <CheckCircle2 className="h-4 w-4 text-emerald-300" />;
  if (health === "failed" || health === "flaky") return <XCircle className="h-4 w-4 text-red-300" />;
  if (health === "running") return <Loader2 className="h-4 w-4 animate-spin text-amber-300" />;
  return <CircleAlert className="h-4 w-4 text-white/40" />;
}

function UserJourneysManager() {
  const { auth } = useAuth();
  const [journeys, setJourneys] = useState<JourneySummary[]>([]);
  const [definition, setDefinition] = useState(INITIAL_DEFINITION);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!auth) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/kody/user-journeys", {
        headers: buildAuthHeaders(auth),
        cache: "no-store",
      });
      const payload = (await response.json()) as { journeys?: JourneySummary[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load User Journeys");
      setJourneys(payload.journeys ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load User Journeys");
    } finally {
      setLoading(false);
    }
  }, [auth]);

  useEffect(() => void load(), [load]);

  async function save() {
    if (!auth) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/kody/user-journeys", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildAuthHeaders(auth) },
        body: JSON.stringify({ action: "save", definition: { ...definition, id: definition.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "new-journey" } }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to save User Journey");
      setShowNew(false);
      setDefinition(INITIAL_DEFINITION);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save User Journey");
    } finally {
      setSaving(false);
    }
  }

  async function run(journeyId: string) {
    if (!auth) return;
    setRunning(journeyId);
    setError(null);
    try {
      const response = await fetch("/api/kody/user-journeys", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildAuthHeaders(auth) },
        body: JSON.stringify({ action: "run", journeyId, environment: "local" }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to queue journey run");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to queue journey run");
    } finally {
      setRunning(null);
    }
  }

  return (
    <PageShell
      title="User Journeys"
      subtitle="Monitor and prove the user paths that matter."
      icon={Clock3}
      iconClassName="text-cyan-300"
      width="wide"
      backHref={auth ? repoScopedHref(auth, "/") : null}
      actions={
        <Button size="sm" onClick={() => setShowNew((value) => !value)}>
          <Plus className="mr-1.5 h-4 w-4" /> New journey
        </Button>
      }
    >
      <div className="space-y-6">
        {error ? <div role="alert" className="flex items-center justify-between rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200"><span>{error}</span><Button variant="ghost" size="sm" onClick={() => void load()}>Retry</Button></div> : null}

        {showNew ? (
          <section aria-label="New User Journey" className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.04] p-5">
            <h2 className="text-lg font-semibold text-white/90">Add a User Journey</h2>
            <p className="mt-1 text-sm text-white/50">Describe the user goal. The first scenario starts with one visible proof.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm text-white/70">Name<input className="mt-1 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-white" value={definition.name} onChange={(event) => setDefinition((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Review a workflow" /></label>
              <label className="text-sm text-white/70">Goal<input className="mt-1 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-white" value={definition.goal} onChange={(event) => setDefinition((current) => ({ ...current, goal: event.target.value }))} placeholder="What must the user be able to do?" /></label>
            </div>
            <div className="mt-4 flex gap-2"><Button onClick={() => void save()} disabled={saving || !definition.name.trim() || !definition.goal.trim()}>{saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Save journey</Button><Button variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button></div>
          </section>
        ) : null}

        <section aria-label="Journey health">
          <div className="mb-3 flex items-center justify-between"><div><h2 className="text-lg font-semibold text-white/90">Journey health</h2><p className="mt-1 text-sm text-white/50">Each result is tied to a version and environment.</p></div><Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "mr-1.5 h-4 w-4 animate-spin" : "mr-1.5 h-4 w-4"} /> Refresh</Button></div>
          {loading ? <EmptyState icon={<Loader2 className="animate-spin" />} title="Loading User Journeys..." /> : journeys.length === 0 ? <EmptyState icon={<Clock3 />} title="No User Journeys yet" hint="Add one above to start monitoring a real user path." /> : <div className="grid gap-3 md:grid-cols-2">{journeys.map((journey) => <article key={journey.journeyId} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium text-white/90">{journey.name}</h3><p className="mt-1 text-sm text-white/50">{journey.goal}</p></div><div className="flex items-center gap-1.5 text-xs text-white/60">{statusIcon(journey.health)}{HEALTH_LABEL[journey.health]}</div></div><div className="mt-4 flex items-center justify-between text-xs text-white/45"><span>Version {journey.currentVersion} · {journey.priority}</span><span>{journey.latestRun ? `${journey.latestRun.environment} · ${journey.latestRun.status}` : "No run yet"}</span></div><div className="mt-4"><Button size="sm" onClick={() => void run(journey.journeyId)} disabled={running !== null || journey.status !== "active"}>{running === journey.journeyId ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />} Run locally</Button></div></article>)}</div>}
        </section>
      </div>
    </PageShell>
  );
}

export default function UserJourneysPage() {
  return <AuthGuard><UserJourneysManager /></AuthGuard>;
}

/** @fileType page */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Loader2, Play, XCircle } from "lucide-react";
import { repoScopedHref } from "@kody-ade/base/routes";
import { AuthGuard } from "../auth-guard";
import { buildAuthHeaders, useAuth } from "@dashboard/lib/auth-context";
import { requestGuidedFlowOpen } from "../guided-flows/events";
import { Button } from "@kody-ade/base/ui/button";
import { PageShell } from "../components/PageShell";
import { EmptyState } from "../components/EmptyState";

type FlowStatus = "active" | "completed" | "cancelled";
interface FlowRecord {
  instance: { instanceId: string; currentStepId: string; status: FlowStatus; revision: number };
  flow: { id: string; title: string; stepIndex: number; stepCount: number };
}
const START_OPTIONS = [
  { id: "create-workflow", title: "Create a workflow", description: "Build a workflow from an existing capability." },
] as const;

function FlowCard({ record, onResume, onCancel, cancelling }: { record: FlowRecord; onResume?: (record: FlowRecord) => void; onCancel?: (record: FlowRecord) => void; cancelling?: boolean }) {
  const { instance, flow } = record;
  const progress = Math.min(100, Math.round(((flow.stepIndex + 1) / flow.stepCount) * 100));
  const status = instance.status === "active" ? "In progress" : instance.status === "completed" ? "Completed" : "Cancelled";
  return (
    <article className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-4"><div><h2 className="font-medium text-white/90">{flow.title}</h2><p className="mt-1 text-sm text-white/50">{status} · Step {flow.stepIndex + 1} of {flow.stepCount}</p></div><span className="rounded-full border border-white/[0.1] px-2 py-1 text-xs text-white/55">{instance.currentStepId}</span></div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.08]" aria-label={`${progress}% complete`}><div className="h-full rounded-full bg-teal-400" style={{ width: `${progress}%` }} /></div>
      {instance.status === "active" && onCancel ? <div className="mt-4 flex gap-2"><Button size="sm" onClick={() => onResume?.(record)}><Play className="mr-1.5 h-4 w-4" /> Resume in chat</Button><Button variant="ghost" size="sm" onClick={() => onCancel(record)} disabled={cancelling}>{cancelling ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <XCircle className="mr-1.5 h-4 w-4" />} Cancel</Button></div> : null}
    </article>
  );
}

function GuidedFlowsManager() {
  const { auth } = useAuth();
  const [records, setRecords] = useState<FlowRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!auth) return;
    setError(null);
    try { const response = await fetch("/api/kody/guided-flows", { headers: buildAuthHeaders(auth), cache: "no-store", signal: AbortSignal.timeout(15000) }); const payload = (await response.json()) as { flows?: FlowRecord[]; error?: string }; if (!response.ok) throw new Error(payload.error ?? "Unable to load Guided Flows"); setRecords(payload.flows ?? []); } catch (cause) { setError(cause instanceof DOMException && cause.name === "TimeoutError" ? "Guided Flows took too long to load. Try again." : cause instanceof Error ? cause.message : "Unable to load Guided Flows"); } finally { setLoading(false); }
  }, [auth]);
  useEffect(() => void load(), [load]);
  const active = useMemo(() => records.filter((record) => record.instance.status === "active"), [records]);
  const history = useMemo(() => records.filter((record) => record.instance.status !== "active"), [records]);
  function resume(record: FlowRecord) {
    requestGuidedFlowOpen(record.instance.instanceId);
  }
  async function start(flowId: string) {
    if (!auth) return; setStarting(flowId); setError(null);
    try { const response = await fetch("/api/kody/guided-flows", { method: "POST", headers: { "Content-Type": "application/json", ...buildAuthHeaders(auth) }, body: JSON.stringify({ action: "start", flowId }) }); const payload = (await response.json()) as { instance?: { instanceId: string }; error?: string }; if (!response.ok || !payload.instance) throw new Error(payload.error ?? "Unable to start Guided Flow"); requestGuidedFlowOpen(payload.instance.instanceId, "started"); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to start Guided Flow"); } finally { setStarting(null); }
  }
  async function cancel(record: FlowRecord) {
    if (!auth) return; setCancelling(record.instance.instanceId); setError(null);
    try { const response = await fetch("/api/kody/guided-flows", { method: "POST", headers: { "Content-Type": "application/json", ...buildAuthHeaders(auth) }, body: JSON.stringify({ action: "cancel", instanceId: record.instance.instanceId, expectedRevision: record.instance.revision, mutationId: crypto.randomUUID() }) }); if (!response.ok) throw new Error("Unable to cancel Guided Flow"); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to cancel Guided Flow"); } finally { setCancelling(null); }
  }
  return <PageShell title="Guided Flows" subtitle="Resume or manage step-by-step work." icon={Clock3} iconClassName="text-teal-300" width="wide" backHref={auth ? repoScopedHref(auth, "/") : null}><div className="space-y-8">
    {error ? <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200"><span>{error}</span><Button variant="ghost" size="sm" onClick={() => void load()}>Retry</Button></div> : null}
    <section><div className="mb-3"><div><h2 className="text-lg font-semibold text-white/90">Start a Guided Flow</h2><p className="mt-1 text-sm text-white/50">Choose a flow and Kody will guide you in the open chat.</p></div></div><div className="grid gap-3 md:grid-cols-2">{START_OPTIONS.map((option) => <article key={option.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4"><div><h3 className="font-medium text-white/90">{option.title}</h3><p className="mt-1 text-sm text-white/50">{option.description}</p></div><Button size="sm" onClick={() => void start(option.id)} disabled={starting !== null || !auth}>{starting === option.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />} Start</Button></article>)}</div></section>
    <section><h2 className="mb-3 text-lg font-semibold text-white/90">In progress</h2>{loading ? <EmptyState icon={<Loader2 className="animate-spin" />} title="Loading Guided Flows..." /> : active.length === 0 ? <EmptyState icon={<Clock3 />} title="No active Guided Flows" hint="Start one above or ask Kody in chat to guide you." /> : <div className="grid gap-3 md:grid-cols-2">{active.map((record) => <FlowCard key={record.instance.instanceId} record={record} onResume={resume} onCancel={(item) => void cancel(item)} cancelling={cancelling === record.instance.instanceId} />)}</div>}</section>
    <section><h2 className="mb-3 text-lg font-semibold text-white/90">History</h2>{history.length === 0 ? <EmptyState icon={<CheckCircle2 />} title="No completed flows yet" hint="Completed and cancelled flows will appear here." /> : <div className="grid gap-3 md:grid-cols-2">{history.map((record) => <FlowCard key={record.instance.instanceId} record={record} />)}</div>}</section>
  </div></PageShell>;
}

export default function GuidedFlowsPage() { return <AuthGuard><GuidedFlowsManager /></AuthGuard>; }

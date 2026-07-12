"use client";

import { AlertCircle, Lightbulb, RefreshCw, Search } from "lucide-react";
import type { Finding, Learning } from "@kody-ade/agency/observation-state";
import { Badge } from "@kody-ade/base/ui/badge";
import { Button } from "@kody-ade/base/ui/button";
import { PageShell } from "./PageShell";
import { RepoScopedLink } from "./RepoScopedLink";
import { useAgencyState } from "../hooks/useAgencyState";

export function AgencyStatePage({ view }: { view: "findings" | "learnings" }) {
  const query = useAgencyState(view);
  const title = view === "findings" ? "Findings" : "Learning";
  const Icon = view === "findings" ? Search : Lightbulb;
  const records = query.data?.records ?? [];

  return (
    <PageShell
      title={title}
      icon={Icon}
      iconClassName={view === "findings" ? "text-amber-300" : "text-violet-300"}
      subtitle={
        view === "findings"
          ? "Problems the agency has observed"
          : "Changes made because of verified findings"
      }
      width="wide"
      actions={
        <Button
          size="sm"
          variant="ghost"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          aria-label={`Refresh ${title.toLowerCase()}`}
        >
          <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
        </Button>
      }
    >
      <nav className="mb-5 flex gap-2" aria-label="Agency state views">
        <Button asChild size="sm" variant={view === "findings" ? "secondary" : "ghost"}>
          <RepoScopedLink href="/findings">Findings</RepoScopedLink>
        </Button>
        <Button asChild size="sm" variant={view === "learnings" ? "secondary" : "ghost"}>
          <RepoScopedLink href="/learning">Learning</RepoScopedLink>
        </Button>
      </nav>

      {query.error ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-4 text-sm text-rose-200">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="h-4 w-4" /> Could not load {title.toLowerCase()}
          </div>
          <p className="mt-1 text-rose-200/70">{query.error.message}</p>
        </div>
      ) : query.isLoading ? (
        <p className="text-sm text-white/50">Loading {title.toLowerCase()}…</p>
      ) : records.length === 0 ? (
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-6 text-center">
          <Icon className="mx-auto h-8 w-8 text-white/25" />
          <p className="mt-3 text-sm text-white/65">No {title.toLowerCase()} recorded yet.</p>
          <p className="mt-1 text-xs text-white/40">
            {view === "findings"
              ? "The agency-observer writes a Finding when an Observation differs from what is expected."
              : "The agency-operating-loop writes a Learning after a verified change."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {view === "findings"
            ? (records as Finding[]).map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))
            : (records as Learning[]).map((learning) => (
                <LearningCard key={learning.id} learning={learning} />
              ))}
        </ul>
      )}

      {(query.data?.invalidCount ?? 0) > 0 && (
        <p className="mt-4 text-xs text-amber-300/70">
          {query.data?.invalidCount} invalid record(s) were ignored.
        </p>
      )}
    </PageShell>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  return (
    <li className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-sm font-medium text-white/90">{finding.title}</h2>
        <div className="flex gap-1.5">
          <Badge variant="outline">{finding.severity}</Badge>
          <Badge variant="outline">{finding.status}</Badge>
        </div>
      </div>
      <dl className="mt-3 space-y-2 text-xs">
        <div><dt className="text-white/35">Expected</dt><dd className="text-white/70">{finding.expectation}</dd></div>
        <div><dt className="text-white/35">Observed</dt><dd className="text-white/70">{finding.actual}</dd></div>
      </dl>
      <p className="mt-3 text-[11px] text-white/35">
        {finding.phase} · {finding.observationIds.length} observation(s) · {formatTime(finding.updatedAt)}
      </p>
    </li>
  );
}

function LearningCard({ learning }: { learning: Learning }) {
  return (
    <li className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-sm font-medium text-white/90">{learning.summary}</h2>
        <Badge variant="outline">{learning.change.kind}</Badge>
      </div>
      <p className="mt-3 text-xs text-white/70">{learning.change.description}</p>
      <p className="mt-2 font-mono text-[11px] text-white/40">{learning.change.target}</p>
      <p className="mt-3 text-[11px] text-white/35">
        From {learning.findingId} · {formatTime(learning.createdAt)}
      </p>
    </li>
  );
}

function formatTime(value: string) {
  return new Date(value).toLocaleString();
}

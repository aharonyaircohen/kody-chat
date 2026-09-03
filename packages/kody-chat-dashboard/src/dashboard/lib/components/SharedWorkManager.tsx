"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, FileCheck2, Loader2, X } from "lucide-react";
import { Badge } from "@kody-ade/base/ui/badge";
import { Button } from "@kody-ade/base/ui/button";
import { buildAuthHeaders, useAuth } from "../auth-context";
import { useRepoScopedHref } from "../hooks/useRepoScopedHref";
import { cn } from "../utils";
import { EmptyState } from "./EmptyState";
import { MasterDetailShell } from "./MasterDetailShell";

type Agent = { tokenId: string; name: string; actorLogin: string };
type Attributed = { recordedAt: string; actor: Agent };
type WorkRecord = {
  recordId: string;
  repository: string;
  title: string;
  objective: string;
  status: string;
  revision: number;
  summary: string;
  goal?: string;
  tasks: string[];
  blockers: string[];
  updatedBy: Agent;
  updatedAt: string;
  checkpoints: Array<Attributed & { summary: string }>;
  evidence: Array<
    Attributed & { kind: string; reference: string; summary: string }
  >;
  decisions: Array<Attributed & { summary: string; rationale?: string }>;
  artifacts: Array<
    Attributed & { kind: string; reference: string; summary: string }
  >;
  handoff?: Attributed & {
    toAgent: string;
    summary: string;
    nextSteps: string[];
  };
};
type WorkEvent = {
  seq: number;
  type: string;
  payload: Record<string, unknown>;
  actor: Agent;
  occurredAt: string;
};
type ApprovalRequest = {
  requestId: string;
  targetKind: "workflow" | "capability" | "automation";
  workflowId: string;
  runId: string;
  mode: "start" | "resume";
  status: string;
  actor: Agent;
  createdAt: string;
  expiresAt: string;
  result?: Record<string, unknown>;
};
type WorkDetail = {
  record: WorkRecord;
  events: WorkEvent[];
  approvalRequests?: ApprovalRequest[];
};

async function readJson<T>(
  path: string,
  headers: Record<string, string>,
): Promise<T> {
  const response = await fetch(path, { headers, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(body.message || body.error || `HTTP ${response.status}`);
  return body as T;
}

function when(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

function Reference({ value }: { value: string }) {
  if (/^https?:\/\//i.test(value)) {
    return (
      <a
        className="text-primary underline underline-offset-2"
        href={value}
        target="_blank"
        rel="noreferrer"
      >
        {value}
      </a>
    );
  }
  return <span className="break-all font-mono text-xs">{value}</span>;
}

export function SharedWorkManager({
  initialRecordId,
}: {
  initialRecordId?: string;
}) {
  const { auth, loading: authLoading } = useAuth();
  const router = useRouter();
  const scopedHref = useRepoScopedHref();
  const headers = useMemo(() => buildAuthHeaders(auth), [auth]);
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [detail, setDetail] = useState<WorkDetail | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [deciding, setDeciding] = useState<string>();

  const load = useCallback(async () => {
    if (!auth) return;
    try {
      const listed = await readJson<{ records: WorkRecord[] }>(
        "/api/kody/shared-work",
        headers,
      );
      setRecords(listed.records);
      if (initialRecordId) {
        setDetail(
          await readJson<WorkDetail>(
            `/api/kody/shared-work/${encodeURIComponent(initialRecordId)}`,
            headers,
          ),
        );
      } else setDetail(null);
      setError(undefined);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Shared work unavailable",
      );
    } finally {
      setLoading(false);
    }
  }, [auth, headers, initialRecordId]);

  const decideApproval = useCallback(
    async (requestId: string, decision: "approved" | "rejected") => {
      setDeciding(requestId);
      try {
        const response = await fetch(
          `/api/kody/mcp/approvals/${encodeURIComponent(requestId)}`,
          {
            method: "POST",
            headers: { ...headers, "content-type": "application/json" },
            body: JSON.stringify({ decision }),
          },
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(
            body.message || body.error || `HTTP ${response.status}`,
          );
        await load();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Approval decision failed",
        );
      } finally {
        setDeciding(undefined);
      }
    },
    [headers, load],
  );

  useEffect(() => {
    if (authLoading || !auth) return;
    void load();
    const interval = window.setInterval(() => void load(), 5_000);
    return () => window.clearInterval(interval);
  }, [auth, authLoading, load]);

  const selected = detail?.record;
  const filtered = records.filter((work) =>
    `${work.title} ${work.objective} ${work.summary} ${work.updatedBy.name}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <MasterDetailShell
      title="Shared Work"
      icon={Bot}
      subtitle={auth ? `${auth.owner}/${auth.repo}` : undefined}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search shared work..."
      searchAriaLabel="Search shared work"
      accent="violet"
      hasSelection={Boolean(selected)}
      detail={
        selected && detail ? (
          <WorkDetailView
            detail={detail}
            deciding={deciding}
            onDecision={decideApproval}
          />
        ) : (
          <EmptyState
            icon={<Bot />}
            title="Select shared work"
            hint="Choose work to see what agents did and how to continue."
          />
        )
      }
    >
      {loading ? (
        <EmptyState
          icon={<Loader2 className="animate-spin" />}
          title="Loading shared work..."
        />
      ) : error ? (
        <EmptyState
          icon={<Bot />}
          title="Could not load shared work"
          hint={error}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Bot />}
          title="No shared work yet"
          hint="Connected coding agents will record their work here."
        />
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map((work) => (
            <li key={work.recordId}>
              <button
                className={cn(
                  "w-full px-4 py-3 text-left hover:bg-accent/50",
                  selected?.recordId === work.recordId && "bg-accent/70",
                )}
                onClick={() =>
                  router.push(scopedHref(`/shared-work/${work.recordId}`))
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-medium">{work.title}</span>
                  <Badge variant="outline">{work.status}</Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {work.summary || work.objective}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {work.updatedBy.name} · revision {work.revision}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </MasterDetailShell>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="space-y-2 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

function WorkDetailView({
  detail,
  deciding,
  onDecision,
}: {
  detail: WorkDetail;
  deciding?: string;
  onDecision: (
    requestId: string,
    decision: "approved" | "rejected",
  ) => Promise<void>;
}) {
  const { record, events, approvalRequests = [] } = detail;
  return (
    <article className="h-full overflow-y-auto p-5 md:p-7">
      <div className="mb-6 border-b border-border pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">{record.title}</h2>
          <Badge>{record.status}</Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{record.objective}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          Updated by {record.updatedBy.name} (@{record.updatedBy.actorLogin}) ·
          revision {record.revision} · {when(record.updatedAt)}
        </p>
      </div>
      <div className="space-y-7">
        {approvalRequests.length > 0 && (
          <Section title="Approvals">
            {approvalRequests.map((request) => (
              <div
                key={request.requestId}
                id={`approval-${request.requestId}`}
                className="space-y-2 border-b border-border pb-3 last:border-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-foreground">
                    {request.mode === "resume" ? "Resume" : "Run"}{" "}
                    {request.targetKind} {request.workflowId}
                  </p>
                  <Badge variant="outline">{request.status}</Badge>
                </div>
                <p className="text-xs">
                  Requested by {request.actor.name} · {when(request.createdAt)}
                </p>
                {request.status === "pending" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={deciding === request.requestId}
                      onClick={() =>
                        void onDecision(request.requestId, "approved")
                      }
                    >
                      {deciding === request.requestId ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Check />
                      )}
                      Approve and run
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={deciding === request.requestId}
                      onClick={() =>
                        void onDecision(request.requestId, "rejected")
                      }
                    >
                      <X /> Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </Section>
        )}
        {record.summary && (
          <Section title="Current state">
            <p className="whitespace-pre-wrap">{record.summary}</p>
          </Section>
        )}
        {record.goal && (
          <Section title="Goal">
            <p>{record.goal}</p>
          </Section>
        )}
        {record.tasks.length > 0 && (
          <Section title="Tasks">
            <ul className="list-disc space-y-1 pl-5">
              {record.tasks.map((task) => (
                <li key={task}>{task}</li>
              ))}
            </ul>
          </Section>
        )}
        {record.blockers.length > 0 && (
          <Section title="Blockers">
            <ul className="list-disc space-y-1 pl-5">
              {record.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </Section>
        )}
        {record.handoff && (
          <Section title="Handoff">
            <p>
              <strong className="text-foreground">
                To {record.handoff.toAgent}:
              </strong>{" "}
              {record.handoff.summary}
            </p>
            <ul className="list-disc pl-5">
              {record.handoff.nextSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </Section>
        )}
        {record.decisions.length > 0 && (
          <Section title="Decisions">
            {record.decisions.map((item, index) => (
              <div key={`${item.recordedAt}-${index}`}>
                <p className="text-foreground">{item.summary}</p>
                {item.rationale && <p>{item.rationale}</p>}
              </div>
            ))}
          </Section>
        )}
        {record.checkpoints.length > 0 && (
          <Section title="Checkpoints">
            {record.checkpoints.map((item, index) => (
              <p key={`${item.recordedAt}-${index}`}>
                {item.summary}{" "}
                <span className="text-xs">— {item.actor.name}</span>
              </p>
            ))}
          </Section>
        )}
        {record.evidence.length > 0 && (
          <Section title="Evidence">
            {record.evidence.map((item, index) => (
              <div key={`${item.recordedAt}-${index}`}>
                <p className="text-foreground">{item.summary}</p>
                <Reference value={item.reference} />
              </div>
            ))}
          </Section>
        )}
        {record.artifacts.length > 0 && (
          <Section title="Artifacts">
            {record.artifacts.map((item, index) => (
              <div key={`${item.recordedAt}-${index}`}>
                <p className="text-foreground">{item.summary}</p>
                <Reference value={item.reference} />
              </div>
            ))}
          </Section>
        )}
        <Section title="Activity">
          {events.map((event) => (
            <div key={event.seq} className="flex gap-3">
              <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                <span className="text-foreground">{event.actor.name}</span>{" "}
                {event.type.replaceAll("_", " ")}{" "}
                <span className="text-xs">· {when(event.occurredAt)}</span>
              </p>
            </div>
          ))}
        </Section>
      </div>
    </article>
  );
}

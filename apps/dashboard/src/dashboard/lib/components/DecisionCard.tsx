"use client";
/**
 * @fileType component
 * @domain kody
 * @pattern inbox-decision-card
 * @ai-summary One pending agent request rendered as a DECISION, not a
 *   notification: plain-words question, a single bold consequence line
 *   ("Approving merges proposal PR #25"), who is asking, the trust stake
 *   ("3/10 approvals until auto"), a prominent Approve, and everything else
 *   (raw title, command, links) collapsed behind Details.
 */
import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GitMerge,
  Loader2,
  MessageSquareText,
  X,
} from "lucide-react";

import { Button } from "@kody-ade/base/ui/button";
import { Card, CardContent } from "@kody-ade/base/ui/card";

import type { CtoRecommendation } from "../cto/recommendation";
import { TRUST_GRADUATION_THRESHOLD } from "../cto/trust-state";
import type { InboxEntry } from "../inbox/types";

type Verdict = "approve" | "reject" | "dismiss";

/** Title minus the machine prefix (`[slug] …` / `slug: …`). */
function questionFromTitle(title: string): string {
  return title
    .replace(/^\[[a-z0-9-]+\]\s*/i, "")
    .replace(/^[a-z0-9-]+:\s*/i, "")
    .trim();
}

export function DecisionCard({
  entry,
  rec,
  deciding,
  trustStreak,
  onDecide,
}: {
  entry: InboxEntry;
  rec: CtoRecommendation;
  deciding: boolean;
  /** Clean-approval streak for the asking capability, or null when unknown. */
  trustStreak: number | null;
  onDecide: (decision: Verdict) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isMerge = rec.action === "merge";
  const repoName = rec.repo?.split("/")[1] ?? null;
  const remaining =
    trustStreak === null
      ? null
      : Math.max(0, TRUST_GRADUATION_THRESHOLD - trustStreak);

  return (
    <Card className="border-amber-500/25 bg-amber-500/[0.04]">
      <CardContent className="p-4 space-y-3">
        <h3 className="text-sm font-semibold leading-snug">
          {questionFromTitle(entry.title)}
        </h3>

        <p className="text-sm font-medium text-amber-200 flex items-center gap-1.5">
          {isMerge ? (
            <GitMerge className="w-4 h-4 shrink-0" />
          ) : (
            <MessageSquareText className="w-4 h-4 shrink-0" />
          )}
          {isMerge
            ? `Approving merges proposal PR #${rec.taskNumber}${repoName ? ` in ${repoName}` : ""}.`
            : `Approving lets ${rec.capability} run on #${rec.taskNumber}.`}
        </p>

        <p className="text-xs text-white/50">
          Asked by <span className="text-white/75">{rec.capability}</span>
          {entry.author ? ` via @${entry.author}` : ""}
          {remaining !== null && remaining > 0
            ? ` · ${trustStreak}/${TRUST_GRADUATION_THRESHOLD} approvals until it runs without asking`
            : remaining === 0
              ? " · trusted (runs without asking)"
              : ""}
        </p>

        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            disabled={deciding}
            onClick={() => onDecide("approve")}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {deciding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={deciding}
            onClick={() => onDecide("reject")}
            className="gap-1.5 border-rose-500/40 text-rose-200 hover:bg-rose-500/15"
          >
            <X className="w-4 h-4" />
            Reject
          </Button>
          <button
            type="button"
            disabled={deciding}
            onClick={() => onDecide("dismiss")}
            className="text-xs text-white/45 hover:text-white/75 underline-offset-2 hover:underline"
            title="Skip without affecting trust"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="ml-auto inline-flex items-center gap-1 text-xs text-white/45 hover:text-white/75"
          >
            Details
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {expanded ? (
          <div className="space-y-2 rounded border border-white/[0.06] bg-black/20 p-3 text-xs text-white/60">
            {entry.snippet ? <p>{entry.snippet}</p> : null}
            <p className="font-mono text-white/45">{entry.title}</p>
            {rec.command ? (
              <p>
                Approve posts{" "}
                <code className="rounded bg-white/[0.05] px-1 py-0.5 font-mono text-white/75">
                  {rec.command}
                </code>
              </p>
            ) : null}
            <a
              href={entry.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sky-300/80 hover:text-sky-200 hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {isMerge ? "Review the full proposal on GitHub" : "Open on GitHub"}
            </a>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

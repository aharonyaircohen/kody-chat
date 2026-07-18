"use client";
/**
 * @fileType component
 * @domain kody
 * @pattern inbox-card
 * @ai-summary THE inbox row — every entry (mention, recommendation, agent
 *   request) renders as this one card so the list reads as one system:
 *     - clickable body → the inline thread modal (or GitHub for threads the
 *       modal can't render);
 *     - header: title (machine prefixes stripped for requests), unread dot,
 *       relative time;
 *     - context line: author · what happened · thread type + number;
 *     - agent asks add a bold consequence line ("Approving merges proposal
 *       PR #25"), the trust stake, and Approve/Reject/Dismiss — replaced by
 *       the verdict badge once decided;
 *     - utility icons (copy link, GitHub, read, mute, remove) on hover.
 */
import { useState } from "react";
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  GitMerge,
  Link2,
  Loader2,
  MessageSquareText,
  MinusCircle,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@kody-ade/base/ui/button";

import {
  ctoCleanSnippet,
  type CtoRecommendation,
} from "../cto/recommendation";
import { TRUST_GRADUATION_THRESHOLD } from "../cto/trust-state";
import {
  SOURCE_LABEL,
  TYPE_SINGULAR,
  VERDICT_CLASS,
  VERDICT_LABEL,
  inboxCategory,
  questionFromTitle,
  relativeTime,
  type CtoVerdict,
} from "../inbox/presentation";
import type { InboxEntry } from "../inbox/types";
import { NOTIFICATION_META } from "../notifications/types";
import type { ServerNotificationType } from "../notifications/prefs-store";
import { RepoScopedLink } from "./RepoScopedLink";
import { cn } from "../utils";

export interface InboxCardProps {
  entry: InboxEntry;
  /** Agent recommendation/request parsed from the entry, or null. */
  rec: CtoRecommendation | null;
  /** Settled verdict for this rec (sentAt-gated), or null while pending. */
  verdict: CtoVerdict | null;
  /** Thread number when the inline modal can render this entry. */
  inlineThreadNumber: number | null;
  /** Clean-approval streak for the asking capability, or null when unknown. */
  trustStreak: number | null;
  deciding: boolean;
  busy: boolean;
  onOpen: () => void;
  onToggleRead: () => void;
  onDelete: () => void;
  onDecide: (decision: CtoVerdict) => void;
  onCopyLink: () => Promise<boolean>;
  isMuted: (category: ServerNotificationType) => boolean;
  onToggleMute: (category: ServerNotificationType) => void;
  repoHref: (href: string) => string;
}

/** One consequence sentence: what a Yes does, in plain words. */
function consequenceLine(rec: CtoRecommendation): string {
  if (rec.action === "merge") {
    const repoName = rec.repo?.split("/")[1];
    return `Approving merges proposal PR #${rec.taskNumber}${repoName ? ` in ${repoName}` : ""}.`;
  }
  return `Approving lets ${rec.capability} run on #${rec.taskNumber}.`;
}

export function InboxCard({
  entry,
  rec,
  verdict,
  inlineThreadNumber,
  trustStreak,
  deciding,
  busy,
  onOpen,
  onToggleRead,
  onDelete,
  onDecide,
  onCopyLink,
  isMuted,
  onToggleMute,
  repoHref,
}: InboxCardProps) {
  const unread = entry.readAt === null;
  const isRequest = entry.source === "request";
  const pending = isRequest && !!rec && verdict === null;
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const category = inboxCategory(entry);
  const muted = category ? isMuted(category) : false;
  const categoryLabel = category ? NOTIFICATION_META[category].label : "";
  const author = entry.author ? `@${entry.author}` : "Someone";
  const preview = rec ? ctoCleanSnippet(entry.snippet) : entry.snippet;
  const remaining =
    trustStreak === null
      ? null
      : Math.max(0, TRUST_GRADUATION_THRESHOLD - trustStreak);

  const copyLink = async () => {
    const ok = await onCopyLink();
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <li
      className={cn(
        "group relative rounded-lg border px-4 py-3.5 transition-colors",
        pending
          ? "border-amber-500/30 bg-amber-500/[0.05]"
          : unread
            ? "border-amber-500/25 bg-amber-500/[0.03] hover:bg-amber-500/[0.06]"
            : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]",
        busy && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden
          className={cn(
            "mt-2 w-2 h-2 rounded-full shrink-0",
            unread ? "bg-amber-400" : "bg-white/20",
          )}
        />
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 min-w-0 text-left"
          title="Open the full item"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h3
              className={cn(
                "min-w-0 text-[15px] leading-snug",
                pending && "whitespace-normal",
                !pending && "truncate",
                unread || pending
                  ? "font-semibold text-white/90"
                  : "font-medium text-white/70",
              )}
            >
              {isRequest
                ? questionFromTitle(entry.title)
                : entry.title || `${author} ${SOURCE_LABEL[entry.source]}`}
            </h3>
            <span className="text-[10px] text-white/40 shrink-0">
              {relativeTime(entry.sentAt)}
            </span>
          </div>

          {rec && isRequest ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-amber-200">
              {rec.action === "merge" ? (
                <GitMerge className="w-4 h-4 shrink-0" />
              ) : (
                <MessageSquareText className="w-4 h-4 shrink-0" />
              )}
              {consequenceLine(rec)}
            </p>
          ) : null}

          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/45 min-w-0">
            <span className="text-white/60 shrink-0">{author}</span>
            <span className="truncate">{SOURCE_LABEL[entry.source]}</span>
            <span aria-hidden className="shrink-0">
              ·
            </span>
            <span className="shrink-0">
              {TYPE_SINGULAR[entry.threadType] ?? entry.threadType}
              {rec ? ` #${rec.taskNumber}` : inlineThreadNumber ? ` #${inlineThreadNumber}` : ""}
            </span>
            {rec && isRequest ? (
              <>
                <span aria-hidden className="shrink-0">
                  ·
                </span>
                <span className="truncate">
                  asked by{" "}
                  <span className="text-white/65">{rec.capability}</span>
                  {pending && remaining !== null
                    ? remaining > 0
                      ? ` — ${trustStreak}/${TRUST_GRADUATION_THRESHOLD} approvals until it runs without asking`
                      : " — trusted (runs without asking)"
                    : ""}
                </span>
              </>
            ) : null}
          </div>

          {!isRequest && preview ? (
            <p className="mt-1 text-sm text-white/55 line-clamp-2">{preview}</p>
          ) : null}
        </button>

        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => void copyLink()}
            title="Copy a shareable link to this thread"
            className="p-1 rounded text-white/50 hover:text-white hover:bg-white/[0.06]"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-300" />
            ) : (
              <Link2 className="w-3.5 h-3.5" />
            )}
          </button>
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open on GitHub"
            className="p-1 rounded text-white/50 hover:text-white hover:bg-white/[0.06]"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            type="button"
            onClick={onToggleRead}
            title={unread ? "Mark as read" : "Mark as unread"}
            className="p-1 rounded text-white/50 hover:text-white hover:bg-white/[0.06]"
          >
            <CheckCheck className="w-3.5 h-3.5" />
          </button>
          {category && (
            <button
              type="button"
              onClick={() => onToggleMute(category)}
              title={
                muted
                  ? `Unmute “${categoryLabel}” notifications`
                  : `Mute “${categoryLabel}” notifications — stop these from landing in your inbox`
              }
              className={cn(
                "p-1 rounded hover:bg-white/[0.06]",
                muted
                  ? "text-amber-300 hover:text-amber-200"
                  : "text-white/50 hover:text-white",
              )}
            >
              {muted ? (
                <Bell className="w-3.5 h-3.5" />
              ) : (
                <BellOff className="w-3.5 h-3.5" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            title="Remove"
            className="p-1 rounded text-white/50 hover:text-rose-300 hover:bg-rose-500/10"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {rec ? (
        <div className="mt-3 ml-5 flex items-center gap-2 flex-wrap">
          {verdict ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium",
                VERDICT_CLASS[verdict],
              )}
              title="This request was already decided"
            >
              {verdict === "approve" ? (
                <Check className="w-3.5 h-3.5" />
              ) : verdict === "reject" ? (
                <X className="w-3.5 h-3.5" />
              ) : (
                <MinusCircle className="w-3.5 h-3.5" />
              )}
              {VERDICT_LABEL[verdict]}
            </span>
          ) : isRequest ? (
            <>
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
            </>
          ) : (
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="h-7 gap-1 border border-amber-500/30 bg-amber-500/[0.06] text-amber-200 hover:bg-amber-500/15"
            >
              <RepoScopedLink href="/reports">
                <FileText className="w-3.5 h-3.5" />
                Review reports
              </RepoScopedLink>
            </Button>
          )}
          {isRequest ? (
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
          ) : (
            <RepoScopedLink
              href={repoHref(`/${rec.taskNumber}`)}
              title="Open this task in the dashboard"
              className="ml-auto text-[11px] font-medium text-sky-300/80 hover:text-sky-200 hover:underline"
            >
              Task #{rec.taskNumber}
            </RepoScopedLink>
          )}
        </div>
      ) : null}

      {expanded && rec ? (
        <div className="mt-2 ml-5 space-y-2 rounded border border-white/[0.06] bg-black/20 p-3 text-xs text-white/60">
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
            {rec.action === "merge"
              ? "Review the full proposal on GitHub"
              : "Open on GitHub"}
          </a>
        </div>
      ) : null}
    </li>
  );
}

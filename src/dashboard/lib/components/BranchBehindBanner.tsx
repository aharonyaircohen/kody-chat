/**
 * @fileType component
 * @domain kody
 * @pattern branch-behind-banner
 * @ai-summary Soft warning when a PR's head branch is behind its base.
 * Non-blocking (unlike Conflict / CI Failure) — surfaces a one-click @kody sync.
 */
"use client";

import { useState } from "react";
import { GitPullRequestArrow, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@dashboard/ui/button";
import { usePRCIStatus } from "../hooks/usePRCIStatus";
import { usePRBehind } from "../hooks/usePRBehind";
import { useGitHubIdentity } from "../hooks/useGitHubIdentity";
import { prsApi } from "../api";

interface BranchBehindBannerProps {
  prNumber: number;
}

export function BranchBehindBanner({ prNumber }: BranchBehindBannerProps) {
  const { data: ciData } = usePRCIStatus(prNumber);
  const { data: behindBy } = usePRBehind(prNumber);
  const { githubUser } = useGitHubIdentity();
  const [isSyncing, setIsSyncing] = useState(false);

  // Conflict / CI-failure banners take priority — they're hard blockers.
  // Behind-by is only worth surfacing once those are clear.
  if (!behindBy || behindBy <= 0) return null;
  if (ciData?.hasConflicts) return null;
  if (ciData?.ciStatus === "failure") return null;

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await prsApi.postComment(prNumber, "@kody sync", githubUser?.login);
      toast.success("Sync requested — Kody will merge base into the PR branch");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to request sync");
    } finally {
      setIsSyncing(false);
    }
  };

  const plural = behindBy === 1 ? "commit" : "commits";

  return (
    <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-t border-cyan-500/30 bg-cyan-500/10">
      <GitPullRequestArrow className="w-4 h-4 text-cyan-300 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-cyan-200 font-medium">
          Branch is {behindBy} {plural} behind base
        </p>
        <p className="text-xs text-cyan-300/80">
          Safe to merge, but the preview was built against an older base.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleSync}
        disabled={isSyncing}
        className="gap-1.5 text-cyan-200 border-cyan-500/40 hover:bg-cyan-500/20 shrink-0"
      >
        {isSyncing ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <RefreshCw className="w-3.5 h-3.5" />
        )}
        <span>Sync</span>
      </Button>
    </div>
  );
}

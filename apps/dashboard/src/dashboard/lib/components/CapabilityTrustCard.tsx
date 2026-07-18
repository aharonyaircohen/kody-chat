"use client";
/**
 * @fileType component
 * @domain kody
 * @pattern capability-trust-card
 * @ai-summary Trust section for one capability's detail page. Shows the
 *   effective autonomy tier (observe/verify run freely; act earns trust via
 *   the ledger), the approval streak, a TrustLevelControl editor, and the
 *   "never auto" pin that keeps the capability approval-required forever.
 */
import { Eye, Loader2, Lock, ShieldQuestion } from "lucide-react";

import { Card, CardContent } from "@kody-ade/base/ui/card";
import { Checkbox } from "@kody-ade/base/ui/checkbox";
import { Label } from "@kody-ade/base/ui/label";

import {
  TRUST_GRADUATION_THRESHOLD,
  trustLevelForCapability,
  trustSubjectKey,
  type TrustLevel,
} from "../cto/trust-state";
import { useTrust } from "../cto/useTrust";
import { TrustLevelControl } from "./TrustLevelControl";

export function CapabilityTrustCard({
  slug,
  capabilityKind,
}: {
  slug: string;
  capabilityKind?: "observe" | "act" | "verify" | null;
}) {
  const trust = useTrust();
  const stats = trust.capabilities[slug] ?? null;
  const subjectStats = trust.subjects[trustSubjectKey("capability", slug)] ?? null;
  const runsFreely = capabilityKind === "observe" || capabilityKind === "verify";
  const neverAuto = stats?.neverAuto === true || subjectStats?.neverAuto === true;
  const level: TrustLevel = neverAuto
    ? "approval-required"
    : trustLevelForCapability(stats, subjectStats);
  const streak = stats?.consecutiveApprovals ?? 0;
  const remaining = Math.max(0, TRUST_GRADUATION_THRESHOLD - streak);

  if (trust.isLoading) {
    return (
      <Card className="border-white/[0.08] bg-white/[0.02]">
        <CardContent className="p-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading trust…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-white/[0.08] bg-white/[0.02]">
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldQuestion className="w-4 h-4 text-muted-foreground" />
            Trust
          </div>
          {runsFreely ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-1">
              <Eye className="w-3.5 h-3.5" />
              {capabilityKind === "observe" ? "Observe" : "Verify"} — runs
              without approval
            </span>
          ) : (
            <TrustLevelControl
              value={level}
              pending={trust.isMutating}
              onChange={(next) => void trust.setTrustLevel({ capability: slug, level: next })}
            />
          )}
        </div>

        {!runsFreely ? (
          <p className="text-xs text-muted-foreground">
            {level === "auto-approval"
              ? "Graduated — the engine may run this capability without asking."
              : streak > 0
                ? `${streak} clean approval${streak === 1 ? "" : "s"} — ${remaining} more to graduate.`
                : "Every run asks for approval until it earns a clean streak."}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3 rounded border border-white/[0.06] bg-black/20 px-3 py-2">
          <Label
            htmlFor={`never-auto-${slug}`}
            className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
            Never auto — always require approval, even after graduating
          </Label>
          <Checkbox
            id={`never-auto-${slug}`}
            checked={neverAuto}
            disabled={trust.isMutating}
            onCheckedChange={(checked) =>
              void trust.setNeverAuto({
                capability: slug,
                neverAuto: checked === true,
              })
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

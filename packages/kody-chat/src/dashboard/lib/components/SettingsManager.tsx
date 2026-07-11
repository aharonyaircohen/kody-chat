/**
 * @fileType component
 * @domain settings
 * @pattern settings-manager
 * @ai-summary Per-USER settings UI — only knobs scoped to this browser/user
 *   live here. Edits optional browser-scoped integration fields in
 *   localStorage.kody_auth via useAuth().updateIntegrations. ALL Fly config
 *   (including Repo Brain on Fly) lives on /runner so Brain has one visible home.
 *   Other per-REPO config is surfaced as links: secrets vault on /secrets,
 *   chat models/prompts on /models and /prompts. (Repo connections + PATs moved
 *   to the header repo switcher — no standalone page.)
 */
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  KeyRound,
  LogOut,
  MessageSquare,
  Store,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@kody-ade/base/ui/button";
import { Card, CardContent } from "@kody-ade/base/ui/card";
import { Input } from "@kody-ade/base/ui/input";
import { Label } from "@kody-ade/base/ui/label";
import { ConfirmDialog } from "@dashboard/lib/components/ConfirmDialog";
import { DefaultChatCard } from "./DefaultChatCard";
import { PageShell } from "@dashboard/lib/components/PageShell";
import {
  DEFAULT_KODY_STORE_REF,
  DEFAULT_KODY_STORE_REPO_URL,
  useAuth,
} from "@dashboard/lib/auth-context";

/** Section divider header — groups the cards under a quiet uppercase label. */
function SectionHeader({
  icon: Icon,
  label,
}: {
  icon?: LucideIcon;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 px-1">
      {Icon ? <Icon className="w-3.5 h-3.5 text-white/40" /> : null}
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
        {label}
      </h2>
    </div>
  );
}

export function SettingsManager() {
  const { auth, logout, updateIntegrations } = useAuth();

  const [storeRepoUrl, setStoreRepo] = useState(DEFAULT_KODY_STORE_REPO_URL);
  const [storeRef, setStoreRef] = useState(DEFAULT_KODY_STORE_REF);

  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmStoreRef, setConfirmStoreRef] = useState(false);

  // Seed form state once auth loads (or repo switches).
  useEffect(() => {
    setStoreRepo(auth?.storeRepoUrl ?? DEFAULT_KODY_STORE_REPO_URL);
    setStoreRef(auth?.storeRef ?? DEFAULT_KODY_STORE_REF);
  }, [auth?.storeRepoUrl, auth?.storeRef]);

  const currentStoreRepoUrl = auth?.storeRepoUrl ?? DEFAULT_KODY_STORE_REPO_URL;
  const currentStoreRef = auth?.storeRef ?? DEFAULT_KODY_STORE_REF;
  const normalizedStoreRepoUrl =
    storeRepoUrl.trim() || DEFAULT_KODY_STORE_REPO_URL;
  const normalizedStoreRef = storeRef.trim() || DEFAULT_KODY_STORE_REF;
  const storeTargetHasChanges =
    normalizedStoreRepoUrl !== currentStoreRepoUrl ||
    normalizedStoreRef !== currentStoreRef;
  const storeRepoUrlIsValid =
    /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/?$/i.test(
      normalizedStoreRepoUrl,
    );
  const storeTargetIsDefault =
    normalizedStoreRepoUrl === DEFAULT_KODY_STORE_REPO_URL &&
    normalizedStoreRef === DEFAULT_KODY_STORE_REF;

  function saveStoreTarget() {
    if (!storeRepoUrlIsValid) {
      toast.error("Store repository must be a GitHub HTTPS URL");
      return;
    }
    updateIntegrations({
      storeRepoUrl:
        normalizedStoreRepoUrl === DEFAULT_KODY_STORE_REPO_URL
          ? null
          : normalizedStoreRepoUrl,
      storeRef:
        normalizedStoreRef === DEFAULT_KODY_STORE_REF
          ? null
          : normalizedStoreRef,
    });
    setConfirmStoreRef(false);
    toast.success("Kody store target saved");
  }

  return (
    <PageShell
      title="Settings"
      icon={KeyRound}
      iconClassName="text-amber-400"
      subtitle={auth?.user?.login ? `@${auth.user.login}` : undefined}
    >
      <div className="space-y-6">
        {/* ═══ Company store (hidden) ════════════════════════════════════ */}
        <section className="space-y-3 hidden">
          <SectionHeader icon={Store} label="Company store" />
          <Card className="border-white/[0.08] bg-white/[0.03]">
            <CardContent className="p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-sky-400" />
                  <h2 className="text-sm font-semibold">Kody store target</h2>
                </div>
                <span className="rounded border border-white/10 bg-black/30 px-2 py-1 font-mono text-xs text-white/70">
                  {currentStoreRepoUrl} @ {currentStoreRef}
                </span>
              </div>
              <p className="text-xs text-white/50 -mt-2">
                Select the GitHub repository and store version this dashboard
                uses for capabilities, commands, and shared assets.
              </p>
              <div className="space-y-2">
                <Label
                  htmlFor="store-repository"
                  className="text-xs text-white/70"
                >
                  Store repository
                </Label>
                <Input
                  id="store-repository"
                  value={storeRepoUrl}
                  onChange={(e) => setStoreRepo(e.target.value)}
                  placeholder={DEFAULT_KODY_STORE_REPO_URL}
                  className="bg-black/30 border-white/10 font-mono"
                />
                {!storeRepoUrlIsValid && (
                  <p className="text-xs text-rose-300">
                    Use a GitHub HTTPS URL.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="store-ref" className="text-xs text-white/70">
                  Store version
                </Label>
                <Input
                  id="store-ref"
                  value={storeRef}
                  onChange={(e) => setStoreRef(e.target.value)}
                  placeholder={DEFAULT_KODY_STORE_REF}
                  className="bg-black/30 border-white/10 font-mono"
                />
                <p className="text-xs text-white/45">
                  Branch or tag in the store repository. Examples: main, stable,
                  v1.2.3.
                </p>
              </div>
              {!storeTargetIsDefault && (
                <div className="flex gap-2 rounded border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <p>
                    Non-default store targets can change company behavior for
                    every store-backed capability this browser runs.
                  </p>
                </div>
              )}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => setConfirmStoreRef(true)}
                  disabled={!storeTargetHasChanges || !storeRepoUrlIsValid}
                >
                  Save
                </Button>
                {storeTargetHasChanges && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setStoreRepo(currentStoreRepoUrl);
                      setStoreRef(currentStoreRef);
                    }}
                  >
                    Reset
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ═══ Chat & integrations ══════════════════════════════════════ */}
        <section className="space-y-3">
          <SectionHeader icon={MessageSquare} label="Chat & integrations" />

          {/* Default chat (which assistant loads on open) */}
          <DefaultChatCard />
        </section>

        {/* ═══ Account ══════════════════════════════════════════════════ */}
        <section className="space-y-3">
          <SectionHeader icon={LogOut} label="Account" />
          <Card className="border-rose-500/20 bg-rose-950/10">
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Sign out</p>
                <p className="text-xs text-white/50 mt-0.5">
                  Clears all stored credentials for this browser.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmLogout(true)}
                className="gap-1 border-rose-500/30 text-rose-200 hover:bg-rose-500/10"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        title="Sign out?"
        description="This clears every stored credential in this browser, including GitHub tokens and local integration settings."
        confirmLabel="Sign out"
        variant="destructive"
        onConfirm={() => logout()}
      />
      <ConfirmDialog
        open={confirmStoreRef}
        onClose={() => setConfirmStoreRef(false)}
        title="Change Kody store target?"
        description="This changes which GitHub repository and store version provide capabilities, commands, and shared assets for this browser."
        confirmLabel="Change store target"
        variant="destructive"
        onConfirm={saveStoreTarget}
      />
    </PageShell>
  );
}

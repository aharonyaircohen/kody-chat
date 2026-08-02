"use client";

import { AlertTriangle, Rocket } from "lucide-react";

import { Button } from "@kody-ade/base/ui/button";
import { INITIALIZE_KODY_ENGINE_FLOW_ID } from "@kody-ade/kody-chat-dashboard/guided-flows/registry";
import { useGuidedFlowChat } from "@kody-ade/kody-chat-dashboard/guided-flows/chat-controller";
import { useAuth } from "@dashboard/lib/auth-context";

import { useEngineSetupStatus } from "../hooks/useEngineSetupStatus";

export function EngineSetupNotice() {
  const { auth } = useAuth();
  const guidedFlow = useGuidedFlowChat();
  const query = useEngineSetupStatus();

  if (!auth || query.isLoading || query.data?.status === "ready") return null;

  if (query.isError || query.data?.status === "unknown") {
    return (
      <div className="px-4 pt-3">
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm"
        >
          <div className="flex min-w-0 items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <div>
              <p className="font-medium text-amber-100">
                Kody could not check this repository&apos;s engine setup.
              </p>
              <p className="mt-0.5 text-amber-100/70">
                Check the repository access granted to this PAT.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (query.data?.status !== "setup_required") return null;

  const startSetup = () => {
    guidedFlow.startFlowInChat(INITIALIZE_KODY_ENGINE_FLOW_ID);
  };

  return (
    <div className="px-4 pt-3">
      <div
        role="status"
        aria-label="Kody Engine setup required"
        className="flex items-center justify-between gap-4 rounded-md border border-teal-500/30 bg-teal-950/20 px-4 py-3"
      >
        <div className="flex min-w-0 items-start gap-2">
          <Rocket className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" />
          <div>
            <p className="text-sm font-medium text-teal-100">
              Kody is not set up in this repository.
            </p>
            <p className="mt-0.5 text-xs text-teal-100/70">
              Install the workflow and repository configuration through Chat.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={startSetup}>
          Set up Kody
        </Button>
      </div>
    </div>
  );
}

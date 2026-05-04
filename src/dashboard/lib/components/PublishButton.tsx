/**
 * @fileType component
 * @domain kody
 * @pattern publish-release
 * @ai-summary Header button that creates a release-request issue and triggers `@kody release`.
 */
"use client";

import { useState } from "react";
import { Rocket } from "lucide-react";
import { Button } from "@dashboard/ui/button";
import { ConfirmDialog } from "./ConfirmDialog";
import { SimpleTooltip } from "./SimpleTooltip";
import { useCreateTask } from "../hooks";
import { kodyApi } from "../api";

interface PublishButtonProps {
  actorLogin?: string;
  onPublished?: (issueNumber: number) => void;
}

export function PublishButton({ actorLogin, onPublished }: PublishButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createTask = useCreateTask();

  async function publish() {
    setError(null);
    setPending(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      // Step 1: create the issue WITHOUT auto-triggering @kody — bare @kody
      // routes to `classify`/`fix`, but we want the `release` orchestrator.
      const task = await createTask.mutateAsync({
        title: `Release: ${today}`,
        body:
          `## Release request\n\n` +
          `Triggered from the dashboard by @${actorLogin ?? "unknown"} on ${today}.\n\n` +
          `The release orchestrator will drive: prepare → merge PR → publish → deploy.`,
        mode: "release",
        labels: ["release"],
        autoTrigger: false,
      });

      // Step 2: post the explicit `@kody release` trigger. See kody2/src/
      // dispatch.ts (extractAfterTag → first token) and src/executables/
      // release/profile.json — the orchestrator picks up the issue number
      // from the comment context.
      await kodyApi.tasks.comment(task.issueNumber, "@kody release", actorLogin);

      onPublished?.(task.issueNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <SimpleTooltip content="Publish a release" side="bottom">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setError(null);
            setShowConfirm(true);
          }}
          disabled={pending}
          aria-label="Publish a release"
          className="gap-1"
        >
          <Rocket className={`w-4 h-4 ${pending ? "animate-pulse" : ""}`} />
          {pending ? "Publishing…" : "Publish"}
        </Button>
      </SimpleTooltip>

      <ConfirmDialog
        open={showConfirm}
        title="Publish a release?"
        description={
          error
            ? `Last attempt failed: ${error}. Confirm to retry.`
            : "This creates a release-request task and triggers @kody release. The orchestrator runs prepare → merge PR → publish → deploy."
        }
        confirmLabel="Publish"
        variant="default"
        onConfirm={publish}
        onClose={() => setShowConfirm(false)}
      />
    </>
  );
}

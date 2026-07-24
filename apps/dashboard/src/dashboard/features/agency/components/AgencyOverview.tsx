"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Compass, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@kody-ade/base/ui/button";
import { Card, CardContent } from "@kody-ade/base/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@kody-ade/base/ui/dialog";
import { Label } from "@kody-ade/base/ui/label";
import { Textarea } from "@kody-ade/base/ui/textarea";
import { buildHeaders, handleResponse } from "@dashboard/lib/api";
import { useAuth } from "@dashboard/lib/auth-context";
import { PageShell } from "@dashboard/lib/components/PageShell";

interface AgencyResponse {
  agency: { intent: string };
  updatedAt: string | null;
}

function formatUpdatedAt(value: string | null): string {
  if (!value) return "Not saved yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Updated"
    : `Updated ${date.toLocaleString()}`;
}

export function AgencyOverview() {
  const { auth } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draftIntent, setDraftIntent] = useState("");
  const queryKey = [
    "agency-overview",
    auth?.owner ?? null,
    auth?.repo ?? null,
  ] as const;
  const headers = buildHeaders({}, auth);

  const query = useQuery({
    queryKey,
    queryFn: async () =>
      handleResponse<AgencyResponse>(
        await fetch("/api/kody/agency", {
          headers,
          cache: "no-store",
        }),
      ),
    enabled: Boolean(auth),
    retry: false,
  });

  const save = useMutation({
    mutationFn: async (intent: string) =>
      handleResponse<AgencyResponse>(
        await fetch("/api/kody/agency", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ intent }),
        }),
      ),
    onSuccess: (response) => {
      queryClient.setQueryData(queryKey, response);
      setEditing(false);
      toast.success("Agency intent saved");
    },
    onError: (error: Error) =>
      toast.error("Could not save intent", { description: error.message }),
  });

  function openEditor() {
    setDraftIntent(query.data?.agency.intent ?? "");
    setEditing(true);
  }

  return (
    <PageShell
      title="Agency overview"
      icon={Compass}
      iconClassName="text-cyan-500"
      subtitle={auth ? `${auth.owner}/${auth.repo}` : undefined}
    >
      <div className="space-y-3">
        {query.isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading agency…
          </p>
        )}

        {query.error && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="space-y-3 p-4 text-sm">
              <div>
                <p className="font-medium text-destructive">
                  Couldn&apos;t load agency
                </p>
                <p className="mt-1 text-muted-foreground">
                  {query.error instanceof Error
                    ? query.error.message
                    : "Unknown error"}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => query.refetch()}
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {query.data && (
          <ul className="space-y-2">
            <li>
              <Card className="border-border bg-card">
                <CardContent className="flex items-start justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">Intent</p>
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                      {query.data.agency.intent}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatUpdatedAt(query.data.updatedAt)}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Edit agency intent"
                    title="Edit intent"
                    onClick={openEditor}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </li>
          </ul>
        )}
      </div>

      <Dialog
        open={editing}
        onOpenChange={(open) => {
          if (!open && !save.isPending) setEditing(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit intent</DialogTitle>
            <DialogDescription>
              Set the direction for this agency.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agency-intent">Intent</Label>
              <Textarea
                id="agency-intent"
                className="min-h-40 resize-y text-base"
                placeholder="What should this agency achieve?"
                value={draftIntent}
                disabled={save.isPending}
                onChange={(event) => setDraftIntent(event.target.value)}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                disabled={save.isPending}
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
              <Button
                disabled={!draftIntent.trim() || save.isPending}
                onClick={() => save.mutate(draftIntent.trim())}
              >
                {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save intent
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

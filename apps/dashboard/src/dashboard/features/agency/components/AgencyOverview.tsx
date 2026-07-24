"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Compass, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@kody-ade/base/ui/button";
import { Label } from "@kody-ade/base/ui/label";
import { Textarea } from "@kody-ade/base/ui/textarea";
import { buildHeaders, handleResponse } from "@dashboard/lib/api";
import { PageShell } from "@dashboard/lib/components/PageShell";

interface AgencyResponse {
  agency: { intent: string };
  updatedAt: string | null;
}

export function AgencyOverview() {
  const [intent, setIntent] = useState("");
  const query = useQuery({
    queryKey: ["agency-overview"],
    queryFn: async () =>
      handleResponse<AgencyResponse>(
        await fetch("/api/kody/agency", {
          headers: buildHeaders(),
          cache: "no-store",
        }),
      ),
  });
  useEffect(() => {
    if (query.data) setIntent(query.data.agency.intent);
  }, [query.data]);
  const save = useMutation({
    mutationFn: async () =>
      handleResponse<AgencyResponse>(
        await fetch("/api/kody/agency", {
          method: "PATCH",
          headers: buildHeaders(),
          body: JSON.stringify({ intent }),
        }),
      ),
    onSuccess: () => toast.success("Agency intent saved"),
    onError: (error: Error) =>
      toast.error("Could not save intent", { description: error.message }),
  });
  return (
    <PageShell
      title="Agency overview"
      icon={Compass}
      iconClassName="text-cyan-400"
      subtitle="Set the direction for this agency"
    >
      <section className="space-y-4">
        <Label htmlFor="agency-intent">Intent</Label>
        <Textarea
          id="agency-intent"
          className="min-h-64 resize-y text-base"
          placeholder="What should this agency achieve?"
          value={intent}
          disabled={query.isLoading}
          onChange={(event) => setIntent(event.target.value)}
        />
        <div className="flex justify-end">
          <Button
            disabled={!intent.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Save intent
          </Button>
        </div>
      </section>
    </PageShell>
  );
}

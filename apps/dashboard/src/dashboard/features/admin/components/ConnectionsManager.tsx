"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@dashboard/lib/auth-guard";
import { buildAuthHeaders, useAuth } from "@dashboard/lib/auth-context";
import { PageShell } from "@dashboard/lib/components/PageShell";
import { RepoScopedLink } from "@dashboard/lib/components/RepoScopedLink";
import type { Connection } from "@dashboard/lib/connections/model";
import { Button } from "@kody-ade/base/ui/button";
import { Card, CardContent } from "@kody-ade/base/ui/card";
import { Input } from "@kody-ade/base/ui/input";
import { Label } from "@kody-ade/base/ui/label";

const CONNECTION_ID = "facebook-main";
const ACCESS_TOKEN_REF = "FACEBOOK_PAGE_ACCESS_TOKEN";

async function responseJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`);
  return json;
}

export function ConnectionsManager() {
  return (
    <AuthGuard>
      <ConnectionsManagerInner />
    </AuthGuard>
  );
}

function ConnectionsManagerInner() {
  const { auth } = useAuth();
  const queryClient = useQueryClient();
  const headers = useMemo(
    () => ({ "Content-Type": "application/json", ...buildAuthHeaders(auth) }),
    [auth],
  );
  const queryKey = ["connections", auth?.owner ?? null, auth?.repo ?? null] as const;
  const connections = useQuery({
    queryKey,
    enabled: !!auth,
    queryFn: async () =>
      responseJson<{ connections: Connection[] }>(
        await fetch("/api/kody/connections", { headers, cache: "no-store" }),
      ),
  });
  const secrets = useQuery({
    queryKey: ["kody-secrets", auth?.owner ?? null, auth?.repo ?? null],
    enabled: !!auth,
    queryFn: async () =>
      responseJson<{ secrets: Array<{ name: string }> }>(
        await fetch("/api/kody/secrets", { headers, cache: "no-store" }),
      ),
  });
  const connection = connections.data?.connections.find(({ id }) => id === CONNECTION_ID) ?? null;
  const [name, setName] = useState("Yair Facebook Page");
  const [externalId, setExternalId] = useState("");
  useEffect(() => {
    if (!connection) return;
    setName(connection.name);
    setExternalId(connection.externalId);
  }, [connection]);

  const save = useMutation({
    mutationFn: async () =>
      responseJson<{ connection: Connection }>(
        await fetch("/api/kody/connections", {
          method: "PUT",
          headers,
          body: JSON.stringify({
            id: CONNECTION_ID,
            name: name.trim(),
            provider: "facebook",
            accountType: "page",
            externalId: externalId.trim(),
            credentialRefs: { accessToken: ACCESS_TOKEN_REF },
            actorLogin: auth?.user.login,
          }),
        }),
      ),
    onSuccess: ({ connection: saved }) => {
      queryClient.setQueryData(queryKey, { connections: [saved] });
      toast.success("Connection saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const verify = useMutation({
    mutationFn: async () =>
      responseJson<{ connection: Connection }>(
        await fetch(`/api/kody/connections/${CONNECTION_ID}/verify`, {
          method: "POST",
          headers,
          body: JSON.stringify({ actorLogin: auth?.user.login }),
        }),
      ),
    onSuccess: ({ connection: verified }) => {
      queryClient.setQueryData(queryKey, { connections: [verified] });
      toast.success("Connection verified");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const secretConfigured =
    secrets.data?.secrets.some(({ name }) => name === ACCESS_TOKEN_REF) ?? false;
  const valid = name.trim().length > 0 && /^\d{1,32}$/.test(externalId.trim());
  const status = connection?.status === "connected"
    ? "Connected"
    : connection?.status === "disabled"
      ? "Disabled"
      : "Needs attention";

  return (
    <PageShell title="Connections" icon={Share2} subtitle={auth ? `${auth.owner}/${auth.repo}` : undefined}>
      <div className="max-w-2xl space-y-4">
        {connections.isLoading || secrets.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-white/50">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading Connection…
          </p>
        ) : null}
        <Card className="border-white/[0.08] bg-white/[0.02]">
          <CardContent className="space-y-5 p-5">
            <div className="flex items-center justify-between">
              <p className="font-medium">Yair Facebook Page</p>
              <span className={connection?.status === "connected" ? "text-sm text-emerald-300" : "text-sm text-amber-300"}>
                {status}
              </span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="connection-name">Name</Label>
              <Input id="connection-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="connection-page-id">Facebook Page ID</Label>
              <Input id="connection-page-id" value={externalId} onChange={(event) => setExternalId(event.target.value)} inputMode="numeric" maxLength={32} />
            </div>
            <div className="rounded-md border border-white/[0.08] bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <code className="text-sm">{ACCESS_TOKEN_REF}</code>
                {secretConfigured ? <span className="flex items-center gap-1 text-xs text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Added</span> : null}
              </div>
              <RepoScopedLink href="/secrets" className="mt-3 inline-block text-sm text-sky-300 underline">
                {secretConfigured ? "Manage secret" : "Add token in Secrets"}
              </RepoScopedLink>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" disabled={!connection || !secretConfigured || verify.isPending} onClick={() => verify.mutate()}>
                {verify.isPending ? "Verifying…" : "Verify Connection"}
              </Button>
              <Button size="sm" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? "Saving…" : "Save Connection"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

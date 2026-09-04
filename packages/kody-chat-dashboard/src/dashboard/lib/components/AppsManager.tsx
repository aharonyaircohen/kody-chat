"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AppWindow,
  ExternalLink,
  Loader2,
  MessageSquare,
  Play,
  RotateCw,
  Square,
  Trash2,
} from "lucide-react";
import { buildAuthHeaders, useAuth } from "../auth-context";
import { useRepoScopedHref } from "../hooks/useRepoScopedHref";
import { Button } from "@kody-ade/base/ui/button";
import { Input } from "@kody-ade/base/ui/input";
import { MasterDetailShell } from "./MasterDetailShell";
import { EmptyState } from "./EmptyState";
import { cn } from "../utils";

interface AppRow {
  appId: string;
  repository: string;
  name: string;
  slug: string;
  branch: string;
  rootDirectory: string;
  observedStatus: string;
  desiredStatus: string;
  provider: { publicUrl?: string };
  exposure: "private" | "public";
  currentDeploymentId?: string;
  secretNames: string[];
  accessTokens: Array<{
    tokenId: string;
    name: string;
    createdAt: string;
    revokedAt?: string;
  }>;
  domains: Array<{ hostname: string; status: string }>;
  storage: Array<{
    volumeId: string;
    name: string;
    mountPath: string;
    sizeGb: number;
  }>;
  updatedAt: string;
}
interface Deployment {
  deploymentId: string;
  commitSha: string;
  status: string;
  createdAt: string;
}
const sections = [
  "Overview",
  "Deployments",
  "Logs",
  "Environment",
  "Domains",
  "Storage",
  "Settings",
  "Danger zone",
] as const;
async function api(
  path: string,
  headers: Record<string, string>,
  init: RequestInit = {},
) {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...headers,
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(body.message || body.error || `HTTP ${response.status}`);
  return body;
}

export function AppsManager({ initialSlug }: { initialSlug?: string }) {
  const { auth, loading: authLoading } = useAuth(),
    router = useRouter(),
    pathname = usePathname(),
    scopedHref = useRepoScopedHref();
  const [apps, setApps] = useState<AppRow[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string>(),
    [search, setSearch] = useState("");
  const headers = useMemo(() => buildAuthHeaders(auth), [auth]);
  const load = useCallback(async () => {
    setError(undefined);
    try {
      const body = await api("/api/kody/apps", headers);
      setApps(body.apps ?? []);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Apps unavailable");
    } finally {
      setLoading(false);
    }
  }, [headers]);
  useEffect(() => {
    if (authLoading || !auth) return;
    void load();
    const interval = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(interval);
  }, [auth, authLoading, load]);
  const selected = apps.find((app) => app.slug === initialSlug),
    filtered = apps.filter((app) =>
      `${app.name} ${app.slug} ${app.repository} ${app.branch} ${app.observedStatus}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("kody:set-chat-scope", {
        detail: selected
          ? {
              kind: "app",
              app: {
                slug: selected.slug,
                repository: selected.repository,
                name: selected.name,
                status: selected.observedStatus,
                branch: selected.branch,
                rootDirectory: selected.rootDirectory,
                exposure: selected.exposure,
                currentDeploymentId: selected.currentDeploymentId,
                secretNames: selected.secretNames,
                domains: selected.domains,
                storage: selected.storage,
              },
            }
          : null,
      }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("kody:set-chat-scope", { detail: null }),
      );
    };
  }, [selected]);
  const openChatSetup = () => {
    sessionStorage.setItem(
      "kody:pending-chat-prefill",
      "Set up this repository as an app",
    );
    window.dispatchEvent(
      new CustomEvent("kody:prefill-chat", {
        detail: { message: "Set up this repository as an app" },
      }),
    );
    const repoPrefix = pathname?.match(/^\/repo\/[^/]+\/[^/]+/)?.[0];
    router.push(repoPrefix ? `${repoPrefix}/chat` : scopedHref("/chat"));
  };
  return (
    <MasterDetailShell
      title="Apps"
      icon={AppWindow}
      subtitle={auth ? `${auth.owner}/${auth.repo}` : undefined}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search apps..."
      searchAriaLabel="Search apps"
      accent="teal"
      hasSelection={Boolean(selected)}
      actions={
        <Button size="sm" onClick={openChatSetup}>
          <MessageSquare className="mr-1 h-4 w-4" />
          New app
        </Button>
      }
      detail={
        selected ? (
          <AppDetail
            app={selected}
            headers={headers}
            refresh={load}
            onDeleted={() => router.replace(scopedHref("/apps"))}
          />
        ) : (
          <EmptyState
            icon={<AppWindow />}
            title="Select an app"
            hint="Choose an app to manage it."
          />
        )
      }
    >
      {loading ? (
        <EmptyState
          icon={<Loader2 className="animate-spin" />}
          title="Loading apps..."
        />
      ) : error ? (
        <EmptyState
          icon={<AppWindow />}
          title="Could not load apps"
          hint={error}
          action={<Button onClick={load}>Retry</Button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<AppWindow />}
          title="No apps yet"
          hint="Ask Kody to set up this repository as an app."
          action={<Button onClick={openChatSetup}>Set up in Chat</Button>}
        />
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map((app) => (
            <li key={app.appId}>
              <button
                className={cn(
                  "w-full px-4 py-3 text-left hover:bg-accent/50",
                  selected?.appId === app.appId && "bg-accent/70",
                )}
                onClick={() => router.push(scopedHref(`/apps/${app.slug}`))}
              >
                <div className="flex justify-between gap-3">
                  <span className="truncate font-medium">{app.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {app.observedStatus}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {app.repository} · {app.branch} ·{" "}
                  {app.currentDeploymentId?.slice(0, 12) ?? "No deployment"}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </MasterDetailShell>
  );
}

function AppDetail({
  app,
  headers,
  refresh,
  onDeleted,
}: {
  app: AppRow;
  headers: Record<string, string>;
  refresh: () => Promise<void>;
  onDeleted: () => void;
}) {
  const [section, setSection] = useState<(typeof sections)[number]>("Overview"),
    [busy, setBusy] = useState<string>(),
    [message, setMessage] = useState<string>(),
    [visibleStatus, setVisibleStatus] = useState(app.observedStatus),
    [deployments, setDeployments] = useState<Deployment[]>([]),
    [logs, setLogs] = useState<unknown>(),
    [createdToken, setCreatedToken] = useState<string>();
  useEffect(() => setVisibleStatus(app.observedStatus), [app.observedStatus]);
  const act = async (path: string, body: unknown, label: string) => {
    setBusy(label);
    setMessage(undefined);
    if (["Start", "Stop", "Restart"].includes(label))
      setVisibleStatus(
        label === "Start"
          ? "starting"
          : label === "Stop"
            ? "stopping"
            : "restarting",
      );
    try {
      const result = await api(path, headers, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (typeof result.status === "string") setVisibleStatus(result.status);
      setMessage(`${label} completed.`);
      await refresh();
      return result;
    } catch (error) {
      setVisibleStatus(app.observedStatus);
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(undefined);
    }
  };
  const startApp = async () => {
    setBusy("Start");
    setMessage(undefined);
    setVisibleStatus("starting");
    try {
      const result = await api(`/api/kody/apps/${app.slug}/actions`, headers, {
        method: "POST",
        body: JSON.stringify({ action: "start" }),
      });
      setVisibleStatus(result.status ?? "running");
      setMessage(
        result.repairing
          ? "The Fly app was missing. Rebuild started automatically."
          : "Start completed.",
      );
      await refresh();
    } catch (error) {
      setVisibleStatus(app.observedStatus);
      setMessage(error instanceof Error ? error.message : "Start failed");
    } finally {
      setBusy(undefined);
    }
  };
  const openApp = async () => {
    const target = window.open("about:blank", "_blank");
    if (target) target.opener = null;
    setBusy("Open");
    setMessage("Signing you in…");
    try {
      const result = await api(`/api/kody/apps/${app.slug}/open`, headers, {
        method: "POST",
      });
      if (target) target.location.replace(result.url);
      else window.location.assign(result.url);
      setMessage("App opened in a signed-in tab.");
    } catch (error) {
      target?.close();
      setMessage(error instanceof Error ? error.message : "Could not open app");
    } finally {
      setBusy(undefined);
    }
  };
  useEffect(() => {
    if (section === "Deployments")
      void api(`/api/kody/apps/${app.slug}/deployments`, headers)
        .then((body) => setDeployments(body.deployments ?? []))
        .catch((error) => setMessage(error.message));
    if (section === "Logs")
      void api(`/api/kody/apps/${app.slug}/logs`, headers)
        .then(setLogs)
        .catch((error) => setMessage(error.message));
  }, [section, app.slug, headers]);
  return (
    <div className="min-h-full">
      <header className="border-b p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{app.name}</h2>
            <AppStatus
              status={visibleStatus}
              branch={app.branch}
              exposure={app.exposure}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="icon"
              aria-label="Start app"
              title="Start app"
              className="bg-emerald-600 text-white hover:bg-emerald-500"
              disabled={Boolean(busy) || visibleStatus === "running"}
              onClick={startApp}
            >
              {busy === "Start" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
            <Button
              size="icon"
              aria-label="Stop app"
              title="Stop app"
              variant="destructive"
              disabled={Boolean(busy) || visibleStatus === "stopped"}
              onClick={() =>
                act(
                  `/api/kody/apps/${app.slug}/actions`,
                  { action: "stop" },
                  "Stop",
                )
              }
            >
              {busy === "Stop" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Square className="h-4 w-4" />
              )}
            </Button>
            <Button
              size="icon"
              aria-label="Restart app"
              title="Restart app"
              className="bg-amber-500 text-black hover:bg-amber-400"
              disabled={Boolean(busy) || visibleStatus !== "running"}
              onClick={() =>
                act(
                  `/api/kody/apps/${app.slug}/actions`,
                  { action: "restart" },
                  "Restart",
                )
              }
            >
              {busy === "Restart" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCw className="h-4 w-4" />
              )}
            </Button>
            {app.provider.publicUrl ? (
              <Button
                size="icon"
                aria-label="Open app"
                title="Open app"
                className="bg-cyan-600 text-white hover:bg-cyan-500"
                disabled={Boolean(busy) || visibleStatus !== "running"}
                onClick={openApp}
              >
                {busy === "Open" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )}
              </Button>
            ) : null}
          </div>
        </div>
        <nav className="mt-4 flex flex-wrap gap-1">
          {sections.map((item) => (
            <Button
              key={item}
              size="sm"
              variant={section === item ? "default" : "ghost"}
              onClick={() => setSection(item)}
            >
              {item}
            </Button>
          ))}
        </nav>
      </header>
      {message ? (
        <p
          role="status"
          className="border-b px-5 py-2 text-sm text-muted-foreground"
        >
          {message}
        </p>
      ) : null}
      <section className="p-5">
        {section === "Overview" ? (
          <Overview app={app} visibleStatus={visibleStatus} />
        ) : section === "Deployments" ? (
          <Deployments app={app} rows={deployments} act={act} />
        ) : section === "Logs" ? (
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded border bg-black/30 p-3 text-xs">
            {JSON.stringify(logs, null, 2)}
          </pre>
        ) : section === "Environment" ? (
          <Environment
            app={app}
            busy={busy}
            createdToken={createdToken}
            saveEnvironment={(names) =>
              act(
                `/api/kody/apps/${app.slug}/environment`,
                { secretNames: names },
                "Update environment",
              )
            }
            createToken={async (name) => {
              const result = await act(
                `/api/kody/apps/${app.slug}/tokens`,
                { action: "create", name },
                "Create token",
              );
              if (result?.accessToken) setCreatedToken(result.accessToken);
            }}
            revoke={(tokenId) =>
              act(
                `/api/kody/apps/${app.slug}/tokens`,
                { action: "revoke", tokenId },
                "Revoke token",
              )
            }
          />
        ) : section === "Domains" ? (
          <Domains app={app} act={act} />
        ) : section === "Storage" ? (
          <Storage app={app} act={act} />
        ) : section === "Settings" ? (
          <Settings
            app={app}
            headers={headers}
            refresh={refresh}
            setMessage={setMessage}
          />
        ) : (
          <Danger
            app={app}
            headers={headers}
            onDeleted={onDeleted}
            setMessage={setMessage}
          />
        )}
      </section>
    </div>
  );
}
function AppStatus({
  status,
  branch,
  exposure,
}: {
  status: string;
  branch: string;
  exposure: AppRow["exposure"];
}) {
  const states: Record<
    string,
    { label: string; detail: string; className: string }
  > = {
    running: {
      label: "Running",
      detail: "ready to open",
      className: "bg-emerald-500/15 text-emerald-400",
    },
    stopped: {
      label: "Stopped",
      detail: "not serving traffic",
      className: "bg-muted text-muted-foreground",
    },
    starting: {
      label: "Starting app…",
      detail: "waiting for the Machine",
      className: "bg-amber-500/15 text-amber-400",
    },
    stopping: {
      label: "Stopping app…",
      detail: "shutting down safely",
      className: "bg-amber-500/15 text-amber-400",
    },
    restarting: {
      label: "Restarting app…",
      detail: "waiting for the Machine",
      className: "bg-amber-500/15 text-amber-400",
    },
    provisioning: {
      label: "Setting up",
      detail: "creating the app",
      className: "bg-cyan-500/15 text-cyan-400",
    },
    deploying: {
      label: "Deploying",
      detail: "building the app",
      className: "bg-cyan-500/15 text-cyan-400",
    },
    verifying: {
      label: "Verifying",
      detail: "checking the app works",
      className: "bg-cyan-500/15 text-cyan-400",
    },
    unhealthy: {
      label: "Needs attention",
      detail: "health check failed",
      className: "bg-destructive/15 text-destructive",
    },
    failed: {
      label: "Failed",
      detail: "open logs for details",
      className: "bg-destructive/15 text-destructive",
    },
  };
  const state = states[status] ?? {
    label: status,
    detail: "status reported by Fly",
    className: "bg-muted text-muted-foreground",
  };
  return (
    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
      <span
        className={cn("rounded-full px-2 py-0.5 font-medium", state.className)}
      >
        {state.label} — {state.detail}
      </span>
      <span className="text-muted-foreground">
        {branch} · {exposure}
      </span>
    </p>
  );
}
function Overview({
  app,
  visibleStatus,
}: {
  app: AppRow;
  visibleStatus: string;
}) {
  return (
    <dl className="grid max-w-2xl gap-3 text-sm sm:grid-cols-2">
      <Info label="Status" value={visibleStatus} />
      <Info label="Desired" value={app.desiredStatus} />
      <Info
        label="Source"
        value={`${app.repository}@${app.branch}:${app.rootDirectory}`}
      />
      <Info
        label="Access"
        value={
          app.exposure === "private" ? "Consumer token required" : "Public"
        }
      />
      <Info label="URL" value={app.provider.publicUrl ?? "Not ready"} />
      <Info label="Updated" value={new Date(app.updatedAt).toLocaleString()} />
    </dl>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all">{value}</dd>
    </div>
  );
}
function Deployments({
  app,
  rows,
  act,
}: {
  app: AppRow;
  rows: Deployment[];
  act: (p: string, b: unknown, l: string) => Promise<unknown>;
}) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div
          key={row.deploymentId}
          className="flex flex-wrap items-center justify-between gap-2 rounded border p-3"
        >
          <div>
            <p className="font-mono text-xs">{row.commitSha.slice(0, 12)}</p>
            <p className="text-xs text-muted-foreground">
              {row.status} · {new Date(row.createdAt).toLocaleString()}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={row.status !== "running"}
            onClick={() =>
              act(
                `/api/kody/apps/${app.slug}/deployments`,
                {
                  requestId: crypto.randomUUID(),
                  rollbackDeploymentId: row.deploymentId,
                },
                "Rollback",
              )
            }
          >
            Rollback
          </Button>
        </div>
      ))}
    </div>
  );
}
function Environment({
  app,
  createdToken,
  createToken,
  revoke,
  saveEnvironment,
  busy,
}: {
  app: AppRow;
  createdToken?: string;
  createToken: (n: string) => void;
  revoke: (id: string) => void;
  saveEnvironment: (names: string[]) => void;
  busy?: string;
}) {
  const [name, setName] = useState("Consumer"),
    [secretNames, setSecretNames] = useState(app.secretNames.join(", "));
  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h3 className="font-medium">Runtime secret names</h3>
        <p className="my-2 text-xs text-muted-foreground">
          Values stay in the repository vault and Fly secret store.
        </p>
        <div className="flex gap-2">
          <Input
            value={secretNames}
            onChange={(event) => setSecretNames(event.target.value)}
            placeholder="DATABASE_URL, API_KEY"
          />
          <Button
            disabled={Boolean(busy)}
            onClick={() =>
              saveEnvironment(
                secretNames
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              )
            }
          >
            Save & restart
          </Button>
        </div>
      </div>
      <div>
        <h3 className="font-medium">Consumer access tokens</h3>
        {createdToken ? (
          <div className="my-3 rounded border border-amber-500/40 p-3">
            <p className="text-xs text-amber-300">
              Copy now. This token will not be shown again.
            </p>
            <code className="mt-2 block break-all text-xs">{createdToken}</code>
          </div>
        ) : null}
        <div className="my-3 flex gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Token name"
          />
          <Button disabled={Boolean(busy)} onClick={() => createToken(name)}>
            Create token
          </Button>
        </div>
        {app.accessTokens.map((token) => (
          <div
            key={token.tokenId}
            className="flex items-center justify-between border-t py-2 text-sm"
          >
            <span>
              {token.name}
              {token.revokedAt ? " · revoked" : ""}
            </span>
            {!token.revokedAt ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => revoke(token.tokenId)}
              >
                Revoke
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
function Domains({
  app,
  act,
}: {
  app: AppRow;
  act: (p: string, b: unknown, l: string) => void;
}) {
  const [hostname, setHostname] = useState("");
  return (
    <div className="max-w-xl">
      <div className="flex gap-2">
        <Input
          value={hostname}
          onChange={(event) => setHostname(event.target.value)}
          placeholder="app.example.com"
        />
        <Button
          onClick={() =>
            act(
              `/api/kody/apps/${app.slug}/domains`,
              { action: "add", hostname },
              "Add domain",
            )
          }
        >
          Add
        </Button>
      </div>
      {app.domains.map((domain) => (
        <div
          key={domain.hostname}
          className="mt-3 flex justify-between rounded border p-3 text-sm"
        >
          <span>
            {domain.hostname} · {domain.status}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              act(
                `/api/kody/apps/${app.slug}/domains`,
                { action: "remove", hostname: domain.hostname },
                "Remove domain",
              )
            }
          >
            Remove
          </Button>
        </div>
      ))}
    </div>
  );
}
function Storage({
  app,
  act,
}: {
  app: AppRow;
  act: (p: string, b: unknown, l: string) => void;
}) {
  const [name, setName] = useState("data"),
    [mountPath, setMountPath] = useState("/data"),
    [size, setSize] = useState(10);
  return (
    <div className="max-w-xl space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Volume name"
        />
        <Input
          value={mountPath}
          onChange={(e) => setMountPath(e.target.value)}
          aria-label="Mount path"
        />
        <Input
          type="number"
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          aria-label="Size GB"
        />
      </div>
      <Button
        onClick={() =>
          act(
            `/api/kody/apps/${app.slug}/storage`,
            { action: "create", name, mountPath, sizeGb: size },
            "Create storage",
          )
        }
      >
        Create storage
      </Button>
      {app.storage.map((volume) => (
        <div
          key={volume.volumeId}
          className="flex flex-wrap justify-between gap-2 rounded border p-3 text-sm"
        >
          <span>
            {volume.name} · {volume.mountPath} · {volume.sizeGb} GB
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                act(
                  `/api/kody/apps/${app.slug}/storage`,
                  { action: "snapshot", volumeId: volume.volumeId },
                  "Snapshot",
                )
              }
            >
              Snapshot
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() =>
                window.confirm(
                  "Snapshot and permanently delete this volume?",
                ) &&
                act(
                  `/api/kody/apps/${app.slug}/storage`,
                  {
                    action: "delete",
                    volumeId: volume.volumeId,
                    confirm: true,
                  },
                  "Delete storage",
                )
              }
            >
              Delete
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
function Settings({
  app,
  headers,
  refresh,
  setMessage,
}: {
  app: AppRow;
  headers: Record<string, string>;
  refresh: () => Promise<void>;
  setMessage: (v: string) => void;
}) {
  const [name, setName] = useState(app.name),
    [branch, setBranch] = useState(app.branch),
    [exposure, setExposure] = useState(app.exposure);
  return (
    <div className="max-w-xl space-y-3">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="App name"
      />
      <Input
        value={branch}
        onChange={(e) => setBranch(e.target.value)}
        aria-label="Branch"
      />
      <label className="block text-sm">
        Access
        <select
          className="mt-1 block w-full rounded border bg-background p-2"
          value={exposure}
          onChange={(event) =>
            setExposure(event.target.value as "private" | "public")
          }
        >
          <option value="private">Private — token required</option>
          <option value="public">Public</option>
        </select>
      </label>
      <Button
        onClick={async () => {
          try {
            await api(`/api/kody/apps/${app.slug}`, headers, {
              method: "PATCH",
              body: JSON.stringify({ name, branch, exposure }),
            });
            setMessage(
              exposure !== app.exposure
                ? "Settings saved; controlled redeploy started."
                : "Settings saved.",
            );
            await refresh();
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Save failed");
          }
        }}
      >
        Save settings
      </Button>
    </div>
  );
}
function Danger({
  app,
  headers,
  onDeleted,
  setMessage,
}: {
  app: AppRow;
  headers: Record<string, string>;
  onDeleted: () => void;
  setMessage: (v: string) => void;
}) {
  return (
    <div className="max-w-xl rounded border border-destructive/40 p-4">
      <h3 className="font-medium text-destructive">Delete App</h3>
      <p className="my-3 text-sm text-muted-foreground">
        Deletes Machines and the Fly App. Storage requires separate confirmation
        and is snapshotted before deletion.
      </p>
      <Button
        variant="destructive"
        onClick={async () => {
          if (!window.confirm(`Delete ${app.name}?`)) return;
          try {
            await api(`/api/kody/apps/${app.slug}`, headers, {
              method: "DELETE",
              body: JSON.stringify({ deleteStorage: false }),
            });
            onDeleted();
          } catch (error) {
            setMessage(
              error instanceof Error ? error.message : "Delete failed",
            );
          }
        }}
      >
        <Trash2 className="mr-1 h-4 w-4" />
        Delete App
      </Button>
    </div>
  );
}

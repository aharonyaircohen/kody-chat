/**
 * @fileType component
 * @domain kody
 * @pattern store-catalog
 * @ai-summary Browse shared Store assets and add them by reference.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  History,
  Layers,
  Loader2,
  Package,
  RefreshCw,
  Bot,
  Target,
  Trash2,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@dashboard/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@dashboard/ui/dialog";

import { buildAuthHeaders, useAuth } from "../auth-context";
import { selectionPath } from "../selection-routing";
import { cn } from "../utils";
import { EmptyState } from "./EmptyState";
import { ListSearch } from "./ListSearch";
import { PageShell } from "./PageShell";

export type CatalogKind =
  | "all"
  | "agent"
  | "agentGoal"
  | "agentLoop"
  | "workflow"
  | "capability"
  | "command";

type CatalogItemKind = Exclude<CatalogKind, "all">;

interface StoreCatalogItem {
  slug: string;
  title: string;
  description: string;
  kind: CatalogItemKind;
  isWorkflow?: boolean;
  workflowSteps?: string[];
  htmlUrl: string | null;
  action?: string | null;
  agent?: string | null;
  schedule?: string | null;
  installed?: boolean;
  uninstallBlockedBy?: Array<{
    kind: CatalogItemKind;
    slug: string;
    title?: string;
  }>;
}

interface StoreCatalogResponse {
  items: StoreCatalogItem[];
}

export interface StoreCatalogViewState {
  kind: CatalogKind;
  search: string;
}

const KIND_FILTERS: Array<{
  id: CatalogKind;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "all", label: "All", icon: Package },
  { id: "agent", label: "Agents", icon: Users },
  { id: "agentGoal", label: "Goals", icon: Target },
  { id: "agentLoop", label: "Loops", icon: History },
  { id: "workflow", label: "Workflows", icon: Workflow },
  { id: "capability", label: "Capabilities", icon: Layers },
  { id: "command", label: "Commands", icon: Bot },
];

const KIND_LABEL: Record<CatalogItemKind, string> = {
  agent: "Agent",
  agentGoal: "Goal",
  agentLoop: "Loop",
  workflow: "Workflow",
  capability: "Capability",
  command: "Command",
};

const CATEGORY_FILTERS = KIND_FILTERS.filter(
  (filter) => filter.id !== "all",
) as Array<{ id: CatalogItemKind; label: string; icon: LucideIcon }>;

const DEFAULT_VIEW_STATE: StoreCatalogViewState = {
  kind: "all",
  search: "",
};

const CATALOG_KIND_IDS = new Set<CatalogKind>(
  KIND_FILTERS.map((filter) => filter.id),
);

function catalogKindFromParam(value: string | null): CatalogKind {
  return CATALOG_KIND_IDS.has(value as CatalogKind)
    ? (value as CatalogKind)
    : "all";
}

function viewStateFromSearchParams(
  params: URLSearchParams,
): StoreCatalogViewState {
  return {
    kind: catalogKindFromParam(params.get("filter")),
    search: params.get("q") ?? "",
  };
}

function readCurrentViewState(): StoreCatalogViewState {
  if (typeof window === "undefined") return DEFAULT_VIEW_STATE;
  return viewStateFromSearchParams(new URLSearchParams(window.location.search));
}

export function storeCatalogPathWithViewState(
  path: string,
  viewState: StoreCatalogViewState,
): string {
  const params = new URLSearchParams();
  if (viewState.kind !== "all") params.set("filter", viewState.kind);
  const q = viewState.search.trim();
  if (q) params.set("q", q);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function queryText(item: StoreCatalogItem): string {
  return [
    item.slug,
    item.title,
    item.description,
    displayKindLabel(item),
    item.action,
    item.agent,
    ...(item.workflowSteps ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isWorkflowCatalogItem(item: StoreCatalogItem): boolean {
  return item.kind === "workflow" || item.isWorkflow === true;
}

function displayKindLabel(item: StoreCatalogItem): string {
  return isWorkflowCatalogItem(item) ? "Workflow" : KIND_LABEL[item.kind];
}

function displayKindIcon(item: StoreCatalogItem): LucideIcon {
  if (isWorkflowCatalogItem(item)) return Workflow;
  return (
    KIND_FILTERS.find((filter) => filter.id === item.kind)?.icon ?? Package
  );
}

function itemMatchesKind(item: StoreCatalogItem, kind: CatalogKind): boolean {
  if (kind === "all") return true;
  if (kind === "workflow") return isWorkflowCatalogItem(item);
  if (kind === "capability") {
    return item.kind === "capability" && !isWorkflowCatalogItem(item);
  }
  return item.kind === kind;
}

export function storeCatalogItemKey(item: StoreCatalogItem): string {
  return `${item.kind}:${item.slug}`;
}

function storeCatalogItemPath(
  item: StoreCatalogItem,
  viewState?: StoreCatalogViewState,
): string {
  const path = selectionPath("/store-catalog", item.kind, item.slug);
  return viewState ? storeCatalogPathWithViewState(path, viewState) : path;
}

async function fetchCatalog(
  headers: Record<string, string>,
): Promise<StoreCatalogResponse> {
  const res = await fetch("/api/kody/store-catalog", {
    headers,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    items?: StoreCatalogItem[];
    error?: string;
    message?: string;
  };

  if (!res.ok) {
    throw new Error(json.message || json.error || `HTTP ${res.status}`);
  }

  return {
    items: json.items ?? [],
  };
}

async function addCatalogStoreReference(
  headers: Record<string, string>,
  item: StoreCatalogItem,
): Promise<{
  imported: boolean;
  status: "imported" | "already_local";
  path: string;
}> {
  const res = await fetch("/api/kody/store-catalog/import", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      kind: item.kind,
      slug: item.slug,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    imported?: boolean;
    status?: "imported" | "already_local";
    path?: string;
    error?: string;
    message?: string;
  };

  if (!res.ok) {
    throw new Error(json.message || json.error || `HTTP ${res.status}`);
  }

  return {
    imported: json.imported === true,
    status: json.status ?? "imported",
    path: json.path ?? "",
  };
}

async function removeCatalogStoreReference(
  headers: Record<string, string>,
  item: StoreCatalogItem,
): Promise<{
  removed: boolean;
  status: "removed" | "already_missing";
  path: string;
}> {
  const res = await fetch("/api/kody/store-catalog/import", {
    method: "DELETE",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      kind: item.kind,
      slug: item.slug,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    removed?: boolean;
    status?: "removed" | "already_missing";
    path?: string;
    error?: string;
    message?: string;
  };

  if (!res.ok) {
    throw new Error(json.message || json.error || `HTTP ${res.status}`);
  }

  return {
    removed: json.removed === true,
    status: json.status ?? "removed",
    path: json.path ?? "",
  };
}

async function invalidateOperationsQueries(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["kody-agent"] }),
    queryClient.invalidateQueries({ queryKey: ["kody-capabilities"] }),
    queryClient.invalidateQueries({ queryKey: ["kody-managed-goals"] }),
    queryClient.invalidateQueries({ queryKey: ["kody-workflow-definitions"] }),
  ]);
}

export function StoreCatalogManager({
  selectedKey = null,
}: {
  selectedKey?: string | null;
} = {}) {
  const router = useRouter();
  const { auth } = useAuth();
  const queryClient = useQueryClient();
  const headers = useMemo(() => buildAuthHeaders(auth), [auth]);
  const queryKey = [
    "kody-store-catalog",
    auth?.owner ?? null,
    auth?.repo ?? null,
    auth?.storeRepoUrl ?? null,
    auth?.storeRef ?? null,
  ] as const;
  const [search, setSearch] = useState(() => readCurrentViewState().search);
  const [kind, setKind] = useState<CatalogKind>(
    () => readCurrentViewState().kind,
  );

  const catalog = useQuery({
    queryKey,
    queryFn: () => fetchCatalog(headers),
    enabled: !!auth,
    staleTime: 30_000,
  });

  const items = useMemo(() => catalog.data?.items ?? [], [catalog.data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (!itemMatchesKind(item, kind)) return false;
      return !q || queryText(item).includes(q);
    });
  }, [items, kind, search]);
  const grouped = useMemo(
    () =>
      CATEGORY_FILTERS.map((filter) => ({
        ...filter,
        items: filtered.filter((item) => itemMatchesKind(item, filter.id)),
      })).filter((group) => group.items.length > 0),
    [filtered],
  );
  const selected = useMemo(
    () =>
      filtered.find((item) => storeCatalogItemKey(item) === selectedKey) ??
      null,
    [filtered, selectedKey],
  );

  useEffect(() => {
    if (catalog.isLoading || !catalog.data) return;
    if (
      selectedKey &&
      !items.some((item) => storeCatalogItemKey(item) === selectedKey)
    ) {
      router.replace(
        storeCatalogPathWithViewState("/store-catalog", { kind, search }),
      );
    }
  }, [
    catalog.data,
    catalog.isLoading,
    items,
    kind,
    router,
    search,
    selectedKey,
  ]);

  const selectCatalogItem = (item: StoreCatalogItem | null) => {
    const viewState = { kind, search };
    router.push(
      item
        ? storeCatalogItemPath(item, viewState)
        : storeCatalogPathWithViewState("/store-catalog", viewState),
      { scroll: false },
    );
  };

  const selectCatalogKind = (nextKind: CatalogKind) => {
    setKind(nextKind);
    if (typeof window === "undefined") return;
    router.replace(
      storeCatalogPathWithViewState(window.location.pathname, {
        kind: nextKind,
        search,
      }),
      { scroll: false },
    );
  };

  const installMutation = useMutation({
    mutationFn: (item: StoreCatalogItem) =>
      addCatalogStoreReference(headers, item),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey });
      await invalidateOperationsQueries(queryClient);
      toast.success(
        result.imported ? "Installed from Store" : "Already installed",
      );
    },
    onError: (error: Error) => {
      toast.error("Couldn't install store item", {
        description: error.message,
      });
    },
  });
  const uninstallMutation = useMutation({
    mutationFn: (item: StoreCatalogItem) =>
      removeCatalogStoreReference(headers, item),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey });
      await invalidateOperationsQueries(queryClient);
      toast.success(
        result.removed ? "Uninstalled from Store" : "Already uninstalled",
      );
    },
    onError: (error: Error) => {
      toast.error("Couldn't uninstall store item", {
        description: error.message,
      });
    },
  });
  const pendingStoreItem =
    installMutation.variables ?? uninstallMutation.variables ?? null;
  const pendingStoreItemKey = pendingStoreItem
    ? storeCatalogItemKey(pendingStoreItem)
    : null;

  return (
    <PageShell
      title="Store Catalog"
      icon={Package}
      iconClassName="text-emerald-400"
      subtitle={auth ? `${auth.owner}/${auth.repo}` : undefined}
      width="full"
      contentClassName="space-y-6"
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => void catalog.refetch()}
          disabled={catalog.isFetching}
          aria-label="Refresh store catalog"
        >
          <RefreshCw
            className={cn("h-4 w-4", catalog.isFetching && "animate-spin")}
          />
        </Button>
      }
    >
      {catalog.error ? (
        <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
          {(catalog.error as Error).message}
        </div>
      ) : null}

      <div className="space-y-3">
        <ListSearch
          value={search}
          onChange={setSearch}
          placeholder="Search store..."
          ariaLabel="Search store catalog"
          accent="emerald"
        />
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {KIND_FILTERS.map((filter) => {
            const active = filter.id === kind;
            const Icon = filter.icon;
            return (
              <button
                key={filter.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectCatalogKind(filter.id)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors",
                  active
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-100"
                    : "border-border bg-background/60 text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      {catalog.isLoading ? (
        <EmptyState icon={<Package />} title="Loading store catalog..." />
      ) : items.length === 0 ? (
        <EmptyState icon={<Package />} title="No store items found" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Package />} title="No matching store items" />
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => {
            const GroupIcon = group.icon;
            return (
              <section
                key={group.id}
                aria-labelledby={`store-group-${group.id}`}
                className="space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <GroupIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                    <h2
                      id={`store-group-${group.id}`}
                      className="text-sm font-semibold text-foreground"
                    >
                      {group.label}
                    </h2>
                  </div>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    {group.items.length}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {group.items.map((item) => (
                    <CatalogCard
                      key={`${item.kind}:${item.slug}`}
                      item={item}
                      onSelect={() => selectCatalogItem(item)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) selectCatalogItem(null);
        }}
      >
        {selected ? (
          <CatalogDetail
            item={selected}
            onInstall={() => installMutation.mutate(selected)}
            onUninstall={() => uninstallMutation.mutate(selected)}
            busy={
              pendingStoreItemKey === storeCatalogItemKey(selected) &&
              (installMutation.isPending || uninstallMutation.isPending)
            }
          />
        ) : null}
      </Dialog>
    </PageShell>
  );
}

function CatalogCard({
  item,
  onSelect,
}: {
  item: StoreCatalogItem;
  onSelect: () => void;
}) {
  const Icon = displayKindIcon(item);
  const uninstallBlocked = (item.uninstallBlockedBy ?? []).length > 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={`store-catalog-row-${item.kind}-${item.slug}`}
      className="group min-h-[6.25rem] w-full rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-emerald-500/30 hover:bg-muted/30"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground transition-colors group-hover:text-emerald-600 dark:group-hover:text-emerald-300">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium leading-5 text-foreground">
            {item.title || item.slug}
          </span>
          <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
            {item.slug}
          </span>
        </div>
      </div>
      {item.description ? (
        <p className="mt-2 line-clamp-1 text-xs leading-5 text-muted-foreground">
          {item.description}
        </p>
      ) : null}
      <div className="mt-2 flex min-h-5 flex-wrap items-center gap-1.5">
        {item.installed ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-100">
            <CheckCircle2 className="h-3 w-3" />
            Installed
          </span>
        ) : (
          <span className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
            Available
          </span>
        )}
        {item.installed && uninstallBlocked ? (
          <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-100">
            In use
          </span>
        ) : null}
      </div>
    </button>
  );
}

function CatalogDetail({
  item,
  onInstall,
  onUninstall,
  busy,
}: {
  item: StoreCatalogItem;
  onInstall: () => void;
  onUninstall: () => void;
  busy: boolean;
}) {
  const Icon = displayKindIcon(item);
  const installed = item.installed === true;
  const blockers = item.uninstallBlockedBy ?? [];
  const uninstallBlocked = installed && blockers.length > 0;

  return (
    <DialogContent className="max-w-2xl border-border bg-card text-card-foreground">
      <DialogHeader className="pr-8">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
          <DialogTitle className="truncate text-xl text-foreground">
            {item.title || item.slug}
          </DialogTitle>
        </div>
        <DialogDescription className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{item.slug}</span>
          <span>{displayKindLabel(item)}</span>
          {installed ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-100">
              <CheckCircle2 className="h-3 w-3" />
              Installed
            </span>
          ) : null}
        </DialogDescription>
      </DialogHeader>

      {item.description ? (
        <p className="text-sm leading-6 text-muted-foreground">
          {item.description}
        </p>
      ) : null}

      <div className="space-y-3">
        <InfoRow label="Type" value={displayKindLabel(item)} />
        {item.action ? <InfoRow label="Action" value={item.action} /> : null}
        {item.agent ? <InfoRow label="Agent" value={item.agent} /> : null}
        {isWorkflowCatalogItem(item) && item.workflowSteps?.length ? (
          <InfoRow label="Steps" value={item.workflowSteps.join(" -> ")} />
        ) : null}
        {(item.kind === "agentGoal" || item.kind === "agentLoop") &&
        item.schedule ? (
          <InfoRow label="Schedule" value={item.schedule} />
        ) : null}
      </div>

      {uninstallBlocked ? (
        <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-100">
          Required by{" "}
          {blockers.map((blocker) => blocker.title || blocker.slug).join(", ")}
          .
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {item.htmlUrl ? (
          <Button asChild size="sm" variant="outline" className="gap-1">
            <a href={item.htmlUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              Open
            </a>
          </Button>
        ) : null}
        <Button
          size="sm"
          onClick={installed ? onUninstall : onInstall}
          disabled={busy || uninstallBlocked}
          data-testid={`store-catalog-import-${item.kind}-${item.slug}`}
          variant={installed ? "outline" : "default"}
          className="gap-1"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : installed ? (
            <Trash2 className="h-4 w-4" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {busy
            ? installed
              ? "Uninstalling..."
              : "Installing..."
            : installed
              ? "Uninstall"
              : "Install"}
        </Button>
      </div>
    </DialogContent>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm md:grid-cols-[10rem_minmax(0,1fr)]">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 truncate text-foreground">{value}</span>
    </div>
  );
}

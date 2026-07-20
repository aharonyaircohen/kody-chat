/**
 * @fileType fixture
 * @domain chat-harness
 * @pattern in-memory-fixtures
 * @ai-summary In-memory fixture backends for the port-3344 chat harness.
 *   The package is chat-only: its chat tools/routes exercise the chat
 *   platform against these typed fixtures instead of the dashboard's
 *   GitHub/gist-backed business modules (which live in apps/dashboard).
 *   Every function mirrors the call signature the chat tools use, so the
 *   tools read identically to the dashboard's — only the storage differs.
 */
import type { Octokit } from "@octokit/rest";
import type { Macro } from "@dashboard/lib/macros";
import type { PreviewAction } from "@dashboard/lib/picker/protocol";
import type { ManagedGoalState } from "@dashboard/lib/managed-goals";
import type { InboxManifest } from "@dashboard/lib/inbox/types";
import type {
  NotificationsManifest,
  NotificationRule,
} from "@dashboard/lib/notifications";
import type {
  CompanyBundle,
  CompanyImportCounts,
  CompanyImportMode,
  CompanyImportResult,
  ParsedCompanyBundle,
} from "@dashboard/lib/company/types";
import { COMPANY_BUNDLE_VERSION } from "@dashboard/lib/company/types";

// Report fixtures moved to src/dashboard/lib/reports-files.ts — the
// @dashboard shim the report tools resolve against in the harness.

// ─── Managed-goal fixtures ───────────────────────────────────────────────────

export interface FixtureManagedGoal {
  id: string;
  path: string;
  state: ManagedGoalState;
  source: "todo";
}

// ─── Dashboard-config fixture (store lives in apps/dashboard) ───────────────

export interface FixtureDashboardConfig {
  version: 1;
  defaultPreviewUrl?: string;
  namedPreviews?: unknown[];
  previewFolders?: Array<{ id: string; label: string }>;
  brainFlyChatEnabled?: boolean;
}

interface FixtureState {
  macros: Macro[];
  managedGoals: FixtureManagedGoal[];
  inbox: InboxManifest;
  notifications: NotificationsManifest;
  dashboardConfig: FixtureDashboardConfig;
  registeredWebhooks: Array<{ owner: string; repo: string; hookUrl: string }>;
  importedBundles: ParsedCompanyBundle[];
}

function seedState(): FixtureState {
  const now = "2026-01-01T00:00:00.000Z";
  const nowMs = Date.parse(now);
  return {
    macros: [
      {
        id: "open-settings",
        name: "Open settings",
        createdAt: nowMs,
        steps: [
          { op: "navigate", url: "/settings" } as unknown as PreviewAction,
          { op: "click", selector: "#save" } as unknown as PreviewAction,
        ],
      },
    ],
    managedGoals: [
      {
        id: "ship-demo",
        path: "todos/ship-demo.json",
        source: "todo",
        state: {
          state: "active",
          type: "release",
          destination: { outcome: "Demo is shipped.", evidence: ["shipped"] },
          route: [
            { stage: "build", evidence: "shipped", capability: "release" },
          ],
          facts: {},
          blockers: [],
        } as unknown as ManagedGoalState,
      },
    ],
    inbox: {
      version: 1,
      entries: [
        {
          id: "Issue:1:hello",
          source: "mention",
          repoFullName: "acme/widgets",
          threadType: "Issue",
          title: "Fixture mention",
          snippet: "You were mentioned in a fixture.",
          author: "octocat",
          url: "https://github.com/acme/widgets/issues/1",
          sentAt: now,
          readAt: null,
        },
      ],
    } as InboxManifest,
    notifications: { version: 1, rules: [] } as NotificationsManifest,
    dashboardConfig: { version: 1 },
    registeredWebhooks: [],
    importedBundles: [],
  };
}

let state: FixtureState = seedState();

/** Reset every fixture store to its seed — call from test setup. */
export function resetChatFixtures(): void {
  state = seedState();
}

// ─── Inbox ───────────────────────────────────────────────────────────────────

export async function readInbox(
  _octokit: Octokit,
  _owner: string,
  _repo: string,
): Promise<{ gistId: string | null; manifest: InboxManifest }> {
  return { gistId: "fixture-gist", manifest: state.inbox };
}

// ─── Macros ──────────────────────────────────────────────────────────────────

export async function readMacrosFile(
  _octokit?: Octokit,
): Promise<{ macros: Macro[] }> {
  return { macros: state.macros };
}

export async function addMacroToFile(opts: {
  octokit: Octokit;
  name: string;
  steps: PreviewAction[];
}): Promise<Macro> {
  const macro: Macro = {
    id: `${opts.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "macro"}-${state.macros.length + 1}`,
    name: opts.name,
    createdAt: Date.now(),
    steps: opts.steps,
  };
  state = { ...state, macros: [macro, ...state.macros] };
  return macro;
}

export async function deleteMacroFromFile(opts: {
  octokit: Octokit;
  id: string;
}): Promise<boolean> {
  const next = state.macros.filter((m) => m.id !== opts.id);
  const removed = next.length !== state.macros.length;
  state = { ...state, macros: next };
  return removed;
}

export async function renameMacroInFile(opts: {
  octokit: Octokit;
  id: string;
  name: string;
}): Promise<Macro | null> {
  const existing = state.macros.find((m) => m.id === opts.id);
  if (!existing) return null;
  const updated: Macro = { ...existing, name: opts.name };
  state = {
    ...state,
    macros: state.macros.map((m) => (m.id === opts.id ? updated : m)),
  };
  return updated;
}

// ─── Managed goals ───────────────────────────────────────────────────────────

export async function listManagedGoalFiles(
  _octokit?: Octokit,
  _owner?: string,
  _repo?: string,
): Promise<FixtureManagedGoal[]> {
  return state.managedGoals;
}

export async function readManagedGoalFile(
  goalId: string,
  _octokit?: Octokit,
  _owner?: string,
  _repo?: string,
): Promise<FixtureManagedGoal | null> {
  return state.managedGoals.find((g) => g.id === goalId) ?? null;
}

export async function writeManagedGoalFile(opts: {
  octokit: Octokit;
  owner: string;
  repo: string;
  id: string;
  message: string;
  state: ManagedGoalState;
}): Promise<void> {
  const goal: FixtureManagedGoal = {
    id: opts.id,
    path: `todos/${opts.id}.json`,
    source: "todo",
    state: opts.state,
  };
  state = {
    ...state,
    managedGoals: [
      ...state.managedGoals.filter((g) => g.id !== opts.id),
      goal,
    ],
  };
}

// ─── Notifications ───────────────────────────────────────────────────────────

export async function readNotificationsManifestFresh(): Promise<{
  manifest: NotificationsManifest;
}> {
  return { manifest: state.notifications };
}

export async function mutateNotificationsManifest<T>(
  mutator: (manifest: NotificationsManifest) => {
    next: NotificationsManifest;
    result: T;
  },
): Promise<{ result: T; rule?: NotificationRule }> {
  const { next, result } = mutator(state.notifications);
  state = { ...state, notifications: next };
  return { result };
}

// ─── Webhooks ────────────────────────────────────────────────────────────────

export async function ensureWebhook(input: {
  token: string;
  owner: string;
  repo: string;
  hookUrl: string;
  events?: string[];
}): Promise<{ ok: boolean; hookId: number; created: boolean }> {
  state = {
    ...state,
    registeredWebhooks: [
      ...state.registeredWebhooks,
      { owner: input.owner, repo: input.repo, hookUrl: input.hookUrl },
    ],
  };
  return { ok: true, hookId: 1, created: state.registeredWebhooks.length === 1 };
}

// ─── Remote dev agent ────────────────────────────────────────────────────────

/** The harness has no remote dev users — remote tools stay unmounted. */
export function getRemoteConfig(
  _ghUsername: string,
): { funnelUrl: string; key: string } | null {
  return null;
}

// ─── Company bundle ──────────────────────────────────────────────────────────

export async function buildCompanyBundle(): Promise<CompanyBundle> {
  return {
    kodyCompany: COMPANY_BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    exportedFrom: "acme/widgets",
    agent: [{ slug: "kody", title: "Kody", body: "Fixture agent." }],
    contexts: [],
    commands: [],
    capabilities: [],
    goals: state.managedGoals.map((g) => ({ id: g.id, state: g.state })),
    instructions: null,
    config: null,
  };
}

export async function applyCompanyBundle(
  _octokit: Octokit,
  bundle: ParsedCompanyBundle,
  mode: CompanyImportMode,
): Promise<CompanyImportResult> {
  state = { ...state, importedBundles: [...state.importedBundles, bundle] };
  const counts = (n: number): CompanyImportCounts => ({
    created: n,
    updated: 0,
    skipped: 0,
    failed: 0,
  });
  return {
    mode,
    agent: counts(bundle.agent?.length ?? 0),
    contexts: counts(bundle.contexts?.length ?? 0),
    commands: counts(bundle.commands?.length ?? 0),
    capabilities: counts(bundle.capabilities?.length ?? 0),
    goals: counts(bundle.goals?.length ?? 0),
    instructions: "absent",
    config: "absent",
    notes: [],
  };
}

// ─── Dashboard config ────────────────────────────────────────────────────────

export async function readFixtureDashboardConfig(): Promise<FixtureDashboardConfig> {
  return state.dashboardConfig;
}

export async function writeFixtureDashboardConfig(
  next: FixtureDashboardConfig,
): Promise<void> {
  state = { ...state, dashboardConfig: next };
}

import { API_BASE, buildHeaders, handleResponse } from "./client";

// ============ Goals API ============

export interface Goal {
  id: string;
  name: string;
  description?: string;
  dueDate?: string;
  /** GitHub login of the single accountable owner. Optional. */
  assignee?: string;
  createdAt: string;
  updatedAt?: string;
  discussionId?: string;
  discussionNumber?: number;
  /**
   * @deprecated Umbrella-era field (engine ≤ 0.4.38). Stacked-PR engines
   * don't write this; the goals API stopped hydrating it in 0.4.39.
   */
  goalIssueNumber?: number;
  /** @deprecated Umbrella-era field (engine ≤ 0.4.38). See goalIssueNumber. */
  goalPrUrl?: string;
}

export interface GoalDiscussionAuthor {
  login: string;
  avatarUrl?: string;
}

export interface GoalDiscussionComment {
  id: string;
  databaseId: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  author: GoalDiscussionAuthor | null;
}

/**
 * Reasons the discussion thread is unavailable. Used by the UI to render
 * the appropriate badge / tooltip.
 */
export type DiscussionDisabledReason =
  "discussions_disabled" | "category_missing" | "provision_failed";

export type GoalDiscussionPayload =
  | {
      enabled: true;
      discussion: { id: string; number: number; url: string };
      comments: GoalDiscussionComment[];
    }
  | {
      enabled: false;
      reason: DiscussionDisabledReason;
      message?: string;
      comments: never[];
    };

export interface GoalsListResponse {
  goals: Goal[];
  capabilities?: { discussionsEnabled: boolean };
}

import type {
  CreateManagedGoalInput,
  ManagedGoalRecord,
} from "../managed-goals";
import type { ManagedGoalRunLogsPayload } from "../managed-goal-run-logs";

export const goalsApi = {
  list: async (): Promise<Goal[]> => {
    const res = await fetch(`${API_BASE}/goals`, {
      headers: buildHeaders(),
      cache: "no-store",
    });
    const data = await handleResponse<{ goals: Goal[] }>(res);
    return data.goals;
  },

  /**
   * List goals along with capability flags (e.g. whether the repo has
   * Discussions enabled). The dashboard uses the capability to decide
   * whether to render the discussion thread or the "off" badge.
   */
  listWithCapabilities: async (): Promise<GoalsListResponse> => {
    const res = await fetch(`${API_BASE}/goals`, {
      headers: buildHeaders(),
      cache: "no-store",
    });
    return handleResponse<GoalsListResponse>(res);
  },
  listManaged: async (): Promise<ManagedGoalRecord[]> => {
    const res = await fetch(`${API_BASE}/goals/managed`, {
      headers: buildHeaders(),
      cache: "no-store",
    });
    const payload = await handleResponse<{ goals: ManagedGoalRecord[] }>(res);
    return payload.goals;
  },
  createManaged: async (
    data: CreateManagedGoalInput & { actorLogin?: string },
  ): Promise<ManagedGoalRecord> => {
    const res = await fetch(`${API_BASE}/goals/managed`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(data),
    });
    const payload = await handleResponse<{ goal: ManagedGoalRecord }>(res);
    return payload.goal;
  },

  updateManaged: async (
    id: string,
    data: import("../managed-goals").UpdateManagedGoalInput,
  ): Promise<ManagedGoalRecord> => {
    const res = await fetch(
      `${API_BASE}/goals/managed/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: buildHeaders(),
        body: JSON.stringify(data),
      },
    );
    const payload = await handleResponse<{ goal: ManagedGoalRecord }>(res);
    return payload.goal;
  },

  removeManaged: async (id: string): Promise<void> => {
    const res = await fetch(
      `${API_BASE}/goals/managed/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: buildHeaders(),
      },
    );
    await handleResponse<{ success: boolean }>(res);
  },

  runManaged: async (
    id: string,
  ): Promise<{
    ok: true;
    workflowId: string;
    ref: string;
    goal: ManagedGoalRecord;
  }> => {
    const res = await fetch(
      `${API_BASE}/goals/managed/${encodeURIComponent(id)}/run`,
      {
        method: "POST",
        headers: buildHeaders(),
      },
    );
    return handleResponse(res);
  },

  runHistory: async (
    id: string,
    limit = 8,
  ): Promise<ManagedGoalRunLogsPayload> => {
    const params = new URLSearchParams({ limit: String(limit) });
    const res = await fetch(
      `${API_BASE}/goals/managed/${encodeURIComponent(id)}/runs?${params}`,
      {
        headers: buildHeaders(),
        cache: "no-store",
      },
    );
    return handleResponse<ManagedGoalRunLogsPayload>(res);
  },

  fetchDiscussion: async (id: string): Promise<GoalDiscussionPayload> => {
    const res = await fetch(
      `${API_BASE}/goals/${encodeURIComponent(id)}/discussion`,
      {
        headers: buildHeaders(),
        cache: "no-store",
      },
    );
    return handleResponse<GoalDiscussionPayload>(res);
  },

  postDiscussionComment: async (
    id: string,
    body: string,
    actorLogin?: string,
  ): Promise<GoalDiscussionComment> => {
    const res = await fetch(
      `${API_BASE}/goals/${encodeURIComponent(id)}/discussion`,
      {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({
          body,
          ...(actorLogin && { actorLogin }),
        }),
      },
    );
    const payload = await handleResponse<{ comment: GoalDiscussionComment }>(
      res,
    );
    return payload.comment;
  },

  create: async (data: {
    name: string;
    description?: string;
    dueDate?: string;
    assignee?: string;
    actorLogin?: string;
  }): Promise<Goal> => {
    const res = await fetch(`${API_BASE}/goals`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(data),
    });
    const payload = await handleResponse<{ goal: Goal }>(res);
    return payload.goal;
  },

  update: async (
    id: string,
    data: {
      name?: string;
      description?: string | null;
      dueDate?: string | null;
      assignee?: string | null;
      actorLogin?: string;
    },
  ): Promise<Goal> => {
    const res = await fetch(`${API_BASE}/goals/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: buildHeaders(),
      body: JSON.stringify(data),
    });
    const payload = await handleResponse<{ goal: Goal }>(res);
    return payload.goal;
  },

  remove: async (id: string, actorLogin?: string): Promise<void> => {
    const params = new URLSearchParams();
    if (actorLogin) params.set("actorLogin", actorLogin);
    const suffix = params.toString() ? `?${params}` : "";
    const res = await fetch(
      `${API_BASE}/goals/${encodeURIComponent(id)}${suffix}`,
      {
        method: "DELETE",
        headers: buildHeaders(),
      },
    );
    await handleResponse<{ success: boolean }>(res);
  },

  reorder: async (
    orderedIds: string[],
    actorLogin?: string,
  ): Promise<Goal[]> => {
    const res = await fetch(`${API_BASE}/goals/reorder`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({
        orderedIds,
        ...(actorLogin && { actorLogin }),
      }),
    });
    const payload = await handleResponse<{ goals: Goal[] }>(res);
    return payload.goals;
  },

  /** Fetch the goal's runtime state file. Returns null when not started. */
  getState: async (
    id: string,
  ): Promise<import("../goal-state").GoalRunState | null> => {
    const res = await fetch(
      `${API_BASE}/goals/${encodeURIComponent(id)}/state`,
      { headers: buildHeaders(), cache: "no-store" },
    );
    const payload = await handleResponse<{
      state: import("../goal-state").GoalRunState | null;
    }>(res);
    return payload.state;
  },

  /** Set the goal's runtime state. Engine-only writes (state="done") are rejected by the API. */
  setState: async (
    id: string,
    body: {
      state: "active" | "paused";
      pausedReason?: string;
      actorLogin?: string;
    },
  ): Promise<import("../goal-state").GoalRunState> => {
    const res = await fetch(
      `${API_BASE}/goals/${encodeURIComponent(id)}/state`,
      {
        method: "PUT",
        headers: buildHeaders(),
        body: JSON.stringify(body),
      },
    );
    const payload = await handleResponse<{
      state: import("../goal-state").GoalRunState;
    }>(res);
    return payload.state;
  },

  /**
   * Toggle "let Kody manage this goal end-to-end". Enabling on a
   * never-started goal also seeds an active state + dispatches the engine.
   */
  manage: async (
    id: string,
    body: { managed: boolean; actorLogin?: string },
  ): Promise<import("../goal-state").GoalRunState> => {
    const res = await fetch(
      `${API_BASE}/goals/${encodeURIComponent(id)}/manage`,
      {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(body),
      },
    );
    const payload = await handleResponse<{
      state: import("../goal-state").GoalRunState;
    }>(res);
    return payload.state;
  },

  /**
   * Approve the manual merge of a parked goal (state="awaiting-merge").
   * Flips it back to active + arms the engine's one-shot finalize.
   */
  merge: async (
    id: string,
    body: { actorLogin?: string } = {},
  ): Promise<import("../goal-state").GoalRunState> => {
    const res = await fetch(
      `${API_BASE}/goals/${encodeURIComponent(id)}/merge`,
      {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(body),
      },
    );
    const payload = await handleResponse<{
      state: import("../goal-state").GoalRunState;
    }>(res);
    return payload.state;
  },
};

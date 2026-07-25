import { describe, expect, it } from "vitest"
import { api } from "../../convex/_generated/api"
import { setup } from "./helpers"

const TENANT = "acme/app"
const NOW = "2026-07-25T00:00:00.000Z"

describe("workflowCheckpoints", () => {
  it("stores checkpoints and returns the latest with its writes", async () => {
    const t = setup()
    await saveCheckpoint(t, "cp-1")
    await saveCheckpoint(t, "cp-2", "cp-1")
    await t.mutation(api.workflowCheckpoints.saveWrites, {
      tenantId: TENANT,
      threadId: "run-1",
      checkpointNs: "",
      checkpointId: "cp-2",
      writes: [
        {
          taskId: "task-1",
          idx: 0,
          channel: "result",
          valueType: "json",
          value: "eyJvayI6dHJ1ZX0=",
        },
      ],
      updatedAt: NOW,
    })

    const latest = await t.query(api.workflowCheckpoints.get, {
      tenantId: TENANT,
      threadId: "run-1",
      checkpointNs: "",
    })

    expect(latest?.checkpointId).toBe("cp-2")
    expect(latest?.parentCheckpointId).toBe("cp-1")
    expect(latest?.writes).toEqual([
      expect.objectContaining({ taskId: "task-1", channel: "result" }),
    ])
  })

  it("keeps normal writes idempotent and replaces special writes", async () => {
    const t = setup()
    await saveCheckpoint(t, "cp-1")
    const base = {
      tenantId: TENANT,
      threadId: "run-1",
      checkpointNs: "",
      checkpointId: "cp-1",
      updatedAt: NOW,
    }
    await t.mutation(api.workflowCheckpoints.saveWrites, {
      ...base,
      writes: [
        { taskId: "task-1", idx: 0, channel: "normal", valueType: "json", value: "first" },
        { taskId: "task-1", idx: -1, channel: "__error__", valueType: "json", value: "old" },
      ],
    })
    await t.mutation(api.workflowCheckpoints.saveWrites, {
      ...base,
      writes: [
        { taskId: "task-1", idx: 0, channel: "normal", valueType: "json", value: "second" },
        { taskId: "task-1", idx: -1, channel: "__error__", valueType: "json", value: "new" },
      ],
    })

    const row = await t.query(api.workflowCheckpoints.get, {
      tenantId: TENANT,
      threadId: "run-1",
      checkpointNs: "",
      checkpointId: "cp-1",
    })

    expect(row?.writes).toEqual([
      expect.objectContaining({ idx: -1, value: "new" }),
      expect.objectContaining({ idx: 0, value: "first" }),
    ])
  })

  it("lists newest first and deletes only the selected thread", async () => {
    const t = setup()
    await saveCheckpoint(t, "cp-1")
    await saveCheckpoint(t, "cp-2", "cp-1")
    await saveCheckpoint(t, "other-1", undefined, "other-run")

    const rows = await t.query(api.workflowCheckpoints.list, {
      tenantId: TENANT,
      threadId: "run-1",
      checkpointNs: "",
      limit: 10,
    })
    expect(rows.map((row) => row.checkpointId)).toEqual(["cp-2", "cp-1"])

    const removed = await t.mutation(api.workflowCheckpoints.deleteThread, {
      tenantId: TENANT,
      threadId: "run-1",
    })

    expect(removed.hasMore).toBe(false)
    expect(
      await t.query(api.workflowCheckpoints.get, {
        tenantId: TENANT,
        threadId: "run-1",
        checkpointNs: "",
      }),
    ).toBeNull()
    expect(
      await t.query(api.workflowCheckpoints.get, {
        tenantId: TENANT,
        threadId: "other-run",
        checkpointNs: "",
      }),
    ).not.toBeNull()
  })
})

async function saveCheckpoint(
  t: ReturnType<typeof setup>,
  checkpointId: string,
  parentCheckpointId?: string,
  threadId = "run-1",
) {
  await t.mutation(api.workflowCheckpoints.save, {
    tenantId: TENANT,
    threadId,
    checkpointNs: "",
    checkpointId,
    ...(parentCheckpointId ? { parentCheckpointId } : {}),
    checkpointType: "json",
    checkpoint: "e30=",
    metadataType: "json",
    metadata: "e30=",
    updatedAt: NOW,
  })
}

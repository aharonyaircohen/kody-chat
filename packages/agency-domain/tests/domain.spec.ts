import { describe, expect, it } from "vitest";
import {
  createCapabilityContract,
  createLoopDefinition,
  createRun,
  createTodo,
  createWorkflowDefinition,
} from "../src/index";

describe("simple AI Agency domain", () => {
  it("accepts exactly one Capability input and output", () => {
    expect(
      createCapabilityContract({
        input: { name: "request", schema: { type: "object" } },
        output: { name: "result", schema: { type: "object" } },
      }),
    ).toEqual({
      input: { name: "request", schema: { type: "object" } },
      output: { name: "result", schema: { type: "object" } },
    });

    for (const forbidden of [
      { agent: "developer" },
      { model: "provider/model" },
      { schedule: "hourly" },
      { workflow: ["inspect", "repair"] },
      { implementation: "legacy-profile" },
      { version: 2 },
    ]) {
      expect(() =>
        createCapabilityContract({
          input: { name: "request", schema: {} },
          output: { name: "result", schema: {} },
          ...forbidden,
        }),
      ).toThrow(/unknown field/i);
    }
  });

  it("puts one Agent on the Workflow, not its steps", () => {
    expect(
      createWorkflowDefinition({
        id: "release",
        agent: "developer",
        steps: [
          {
            id: "inspect",
            capabilityRef: { kind: "capability", id: "inspect" },
          },
          {
            id: "publish",
            capabilityRef: { kind: "capability", id: "publish" },
            dependsOn: ["inspect"],
            condition: "inspect.succeeded",
          },
        ],
      }),
    ).toMatchObject({ id: "release", agent: "developer" });
    expect(() =>
      createWorkflowDefinition({
        id: "release",
        agent: "developer",
        steps: [
          {
            id: "inspect",
            capabilityRef: { kind: "capability", id: "inspect" },
            agent: "reviewer",
          },
        ],
      }),
    ).toThrow(/unknown field "agent"/i);
  });

  it("keeps Todo finite and free of execution configuration", () => {
    expect(
      createTodo({
        id: "ship-release",
        outcome: "The release is live",
        status: "in-progress",
        evidence: ["deployment-url"],
        checklist: [{ id: "verify", text: "Verify release", done: false }],
        blockers: [],
        runIds: ["run-1"],
      }),
    ).toMatchObject({ status: "in-progress", runIds: ["run-1"] });
    expect(() =>
      createTodo({
        id: "ship-release",
        outcome: "The release is live",
        status: "todo",
        evidence: [],
        checklist: [],
        blockers: [],
        runIds: [],
        workflow: "release",
      }),
    ).toThrow(/workflow/);
  });

  it("keeps Loop to trigger, target, input, and enabled", () => {
    expect(
      createLoopDefinition({
        id: "daily-check",
        trigger: { type: "schedule", every: "1d" },
        target: { kind: "workflow", id: "release" },
        input: { repository: "acme/app" },
        enabled: true,
      }),
    ).toMatchObject({ id: "daily-check", enabled: true });
    expect(() =>
      createLoopDefinition({
        id: "daily-check",
        trigger: { type: "schedule", every: "1d" },
        target: { kind: "workflow", id: "release" },
        input: {},
        enabled: true,
        health: "healthy",
      }),
    ).toThrow(/health/);
  });

  it("records the Agent used by a Run and has no Implementation reference", () => {
    const run = createRun({
      id: "run-1",
      status: "succeeded",
      target: { kind: "workflow", id: "release" },
      agent: "developer",
      startedAt: "2026-07-24T00:00:00.000Z",
      finishedAt: "2026-07-24T00:01:00.000Z",
    });
    expect(run).toMatchObject({ agent: "developer" });
    expect(run).not.toHaveProperty("execution");
    expect(() =>
      createRun({
        id: "run-2",
        status: "running",
        target: { kind: "capability", id: "inspect" },
        agent: "kody",
        startedAt: "2026-07-24T00:00:00.000Z",
        implementation: "legacy",
      }),
    ).toThrow(/implementation/);
  });
});

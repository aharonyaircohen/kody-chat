import { describe, expect, it } from "vitest";

import {
  addWorkflowGraphStep,
  graphWorkflowDefinition,
  removeWorkflowGraphNode,
  validateWorkflowGraph,
  workflowDefinitionGraph,
} from "@dashboard/lib/workflow-graph";

describe("workflow graph", () => {
  it("turns a legacy capability queue into a visual linear graph", () => {
    const graph = workflowDefinitionGraph({
      version: 1,
      name: "Legacy",
      capabilities: ["inspect", "repair", "verify"],
      createdAt: "2026-07-15T00:00:00Z",
      updatedAt: "2026-07-15T00:00:00Z",
    });

    expect(graph.nodes.map((node) => node.id)).toEqual([
      "inspect",
      "repair",
      "verify",
    ]);
    expect(graph.edges.map((edge) => [edge.source, edge.target])).toEqual([
      ["inspect", "repair"],
      ["repair", "verify"],
    ]);
  });

  it("preserves conditions and safe backward connections", () => {
    const definition = graphWorkflowDefinition(
      "Pilot",
      [
        { id: "inspect", capability: "inspect" },
        { id: "repair", capability: "repair" },
        { id: "done", capability: "verify" },
      ],
      [
        {
          id: "inspect-repair",
          source: "inspect",
          target: "repair",
          when: { "facts.needsFix": true },
        },
        {
          id: "repair-inspect",
          source: "repair",
          target: "inspect",
          maxIterations: 2,
        },
        {
          id: "inspect-done",
          source: "inspect",
          target: "done",
          default: true,
        },
      ],
      "inspect",
    );

    expect(definition.startAt).toBe("inspect");
    expect(definition.steps?.[0]?.next).toEqual([
      { to: "repair", when: { "facts.needsFix": true } },
      { to: "done", default: true },
    ]);
    expect(definition.steps?.[1]?.next).toEqual([
      { to: "inspect", maxIterations: 2 },
    ]);
  });

  it("turns conditional paths into a visual decision node", () => {
    const graph = workflowDefinitionGraph({
      version: 1,
      name: "Release",
      capabilities: ["inspect", "repair", "verify"],
      startAt: "inspect",
      steps: [
        {
          id: "inspect",
          capability: "inspect",
          next: [
            { to: "repair", when: { "facts.needsFix": true } },
            { to: "verify", default: true },
          ],
        },
        { id: "repair", capability: "repair" },
        { id: "verify", capability: "verify" },
      ],
      createdAt: "2026-07-15T00:00:00Z",
      updatedAt: "2026-07-15T00:00:00Z",
    });

    expect(graph.nodes).toContainEqual({
      id: "inspect__decision",
      kind: "decision",
      question: "Does this step match the rule?",
    });
    expect(graph.edges.map(({ source, target }) => [source, target])).toEqual([
      ["inspect", "inspect__decision"],
      ["inspect__decision", "repair"],
      ["inspect__decision", "verify"],
    ]);
  });

  it("folds visual decision nodes back into the engine workflow format", () => {
    const definition = graphWorkflowDefinition(
      "Release",
      [
        { id: "inspect", capability: "inspect" },
        { id: "inspect__decision", kind: "decision", question: "Needs fix?" },
        { id: "repair", capability: "repair" },
        { id: "verify", capability: "verify" },
      ],
      [
        {
          id: "inspect-decision",
          source: "inspect",
          target: "inspect__decision",
        },
        {
          id: "decision-repair",
          source: "inspect__decision",
          target: "repair",
          when: { "facts.needsFix": true },
        },
        {
          id: "decision-verify",
          source: "inspect__decision",
          target: "verify",
          default: true,
        },
      ],
      "inspect",
    );

    expect(definition.steps?.[0]?.next).toEqual([
      { to: "repair", when: { "facts.needsFix": true } },
      { to: "verify", default: true },
    ]);
    expect(
      definition.steps?.some((step) => step.id === "inspect__decision"),
    ).toBe(false);
  });

  it("rejects unsafe loops and broken connections before save", () => {
    expect(
      validateWorkflowGraph({
        startAt: "inspect",
        nodes: [
          { id: "inspect", capability: "inspect" },
          { id: "repair", capability: "repair" },
        ],
        edges: [
          { id: "missing", source: "inspect", target: "gone" },
          { id: "unsafe", source: "repair", target: "inspect" },
        ],
      }),
    ).toEqual([
      "Connection inspect → gone points to a missing capability.",
      "Backward connection repair → inspect needs a maximum repeat count.",
    ]);
  });

  it("adds repeated capabilities as unique visual steps", () => {
    const first = addWorkflowGraphStep(
      { startAt: null, nodes: [], edges: [] },
      "verify",
    );
    const second = addWorkflowGraphStep(first, "verify");

    expect(second.startAt).toBe("verify");
    expect(second.nodes).toEqual([
      { id: "verify", capability: "verify" },
      { id: "verify-2", capability: "verify" },
    ]);
    expect(second.edges).toEqual([
      expect.objectContaining({ source: "verify", target: "verify-2" }),
    ]);
  });

  it("removes a step and any orphaned visual decision", () => {
    const graph = removeWorkflowGraphNode(
      {
        startAt: "inspect",
        nodes: [
          { id: "inspect", capability: "inspect" },
          { id: "inspect__decision", kind: "decision" },
          { id: "repair", capability: "repair" },
          { id: "verify", capability: "verify" },
        ],
        edges: [
          {
            id: "inspect-decision",
            source: "inspect",
            target: "inspect__decision",
          },
          {
            id: "decision-repair",
            source: "inspect__decision",
            target: "repair",
            when: { "facts.needsFix": true },
          },
          {
            id: "decision-verify",
            source: "inspect__decision",
            target: "verify",
            default: true,
          },
        ],
      },
      "inspect",
    );

    expect(graph.nodes.map((node) => node.id)).toEqual(["repair", "verify"]);
    expect(graph.edges).toEqual([]);
    expect(graph.startAt).toBe("repair");
  });
});

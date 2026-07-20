"use client";

import { useEffect, useMemo, useState } from "react";
import ELK from "elkjs/lib/elk.bundled.js";
import {
  addEdge,
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";

import { Button } from "@kody-ade/base/ui/button";
import { Input } from "@kody-ade/base/ui/input";
import { Label } from "@kody-ade/base/ui/label";
import type {
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
} from "@dashboard/lib/workflow-graph";
import { removeWorkflowGraphNode } from "@dashboard/lib/workflow-graph";
import type { WorkflowRunState } from "@dashboard/lib/workflow-run-state";
import {
  FRIENDLY_RESULT_STATUSES,
  conditionFromFriendlySelection,
  friendlyConditionFromWhen,
  friendlyDecisionQuestion,
  friendlyStatusLabel,
  type FriendlyResultStatus,
} from "@dashboard/lib/workflow-condition";

const elk = new ELK();
const NODE_WIDTH = 220;
const NODE_HEIGHT = 68;
const DECISION_WIDTH = 164;
const DECISION_HEIGHT = 88;

interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  kind: "capability" | "decision";
  capability?: string;
  question?: string;
  start: boolean;
  status?: "running" | "done";
}

type WorkflowFlowNode = Node<WorkflowNodeData>;

type WorkflowGraphChange =
  WorkflowGraph | ((current: WorkflowGraph) => WorkflowGraph);

interface WorkflowGraphCanvasProps {
  graph: WorkflowGraph;
  editable?: boolean;
  onChange?: (change: WorkflowGraphChange) => void;
  runId?: string;
  runState?: WorkflowRunState;
}

type EdgeMode = "always" | "when" | "otherwise";

function edgeMode(edge: WorkflowGraphEdge): EdgeMode {
  if (edge.default) return "otherwise";
  if (edge.when && Object.keys(edge.when).length > 0) return "when";
  return "always";
}

function edgeLabel(
  edge: WorkflowGraphEdge,
  sourceNode?: WorkflowGraphNode,
): string | undefined {
  if (edge.maxIterations) return `loop ≤ ${edge.maxIterations}`;
  if (sourceNode?.kind === "decision") {
    if (edge.default) return "No";
    if (edge.when) return "Yes";
  }
  if (edge.default) return "otherwise";
  if (edge.when) return "when";
  return undefined;
}

function isBackwardEdge(
  graph: WorkflowGraph,
  edge: WorkflowGraphEdge,
): boolean {
  const capabilityPositions = new Map(
    graph.nodes
      .filter((node) => node.kind !== "decision")
      .map((node, index) => [node.id, index]),
  );
  const sourceNode = graph.nodes.find((node) => node.id === edge.source);
  const source =
    sourceNode?.kind === "decision"
      ? capabilityPositions.get(
          graph.edges.find((candidate) => candidate.target === edge.source)
            ?.source ?? "",
        )
      : capabilityPositions.get(edge.source);
  const target = capabilityPositions.get(edge.target);
  return source !== undefined && target !== undefined && target <= source;
}

function reactEdges(
  edges: WorkflowGraphEdge[],
  nodes: WorkflowGraphNode[],
): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edgeLabel(
      edge,
      nodes.find((node) => node.id === edge.source),
    ),
    markerEnd: { type: MarkerType.ArrowClosed },
    animated: edge.maxIterations !== undefined,
    style: edge.maxIterations
      ? { stroke: "rgb(251 146 60)" }
      : edge.when
        ? { stroke: "rgb(34 211 238)" }
        : undefined,
  }));
}

function conditionPathLabel(path: string): string {
  return path.startsWith("facts.") ? path.slice("facts.".length) : path;
}

function conditionPathValue(field: string): string {
  const value = field.trim();
  if (!value) return "facts.result";
  return value.includes(".") ? value : `facts.${value}`;
}

function parseConditionValue(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (trimmed !== "" && Number.isFinite(Number(trimmed)))
    return Number(trimmed);
  return trimmed;
}

function formatConditionValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null) return "null";
  return String(value);
}

function mappingPathLabel(path: string): string {
  return path.startsWith("facts.") ? path.slice("facts.".length) : path;
}

function mappingPathValue(field: string): string {
  const value = field.trim();
  if (!value) return "facts.result";
  return value.includes(".") ? value : `facts.${value}`;
}

async function layoutNodes(
  graph: WorkflowGraph,
  runState?: WorkflowRunState,
): Promise<WorkflowFlowNode[]> {
  const layout = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "36",
      "elk.layered.spacing.nodeNodeBetweenLayers": "72",
    },
    children: graph.nodes.map((node) => ({
      id: node.id,
      width: node.kind === "decision" ? DECISION_WIDTH : NODE_WIDTH,
      height: node.kind === "decision" ? DECISION_HEIGHT : NODE_HEIGHT,
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  });

  const positions = new Map(
    (layout.children ?? []).map((node) => [
      node.id,
      { x: node.x ?? 0, y: node.y ?? 0 },
    ]),
  );
  const completed = new Set(runState?.completedStepIds ?? []);
  return graph.nodes.map((node) => ({
    id: node.id,
    type: node.kind === "decision" ? "decision" : "capability",
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    data: {
      label:
        node.kind === "decision"
          ? friendlyDecisionQuestion(
              graph.edges.find((edge) => edge.source === node.id && edge.when)
                ?.when,
            )
          : (node.capability ?? node.id),
      kind: node.kind === "decision" ? "decision" : "capability",
      capability: node.capability,
      question:
        node.kind === "decision"
          ? friendlyDecisionQuestion(
              graph.edges.find((edge) => edge.source === node.id && edge.when)
                ?.when,
            )
          : node.question,
      start: node.id === graph.startAt,
      status:
        node.id === runState?.currentStepId
          ? "running"
          : completed.has(node.id)
            ? "done"
            : undefined,
    },
  }));
}

function CapabilityNode({ data }: NodeProps<WorkflowFlowNode>) {
  return (
    <div className="relative rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-sm text-foreground">
          {data.label}
        </span>
        {data.start ? (
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-cyan-300">
            start
          </span>
        ) : null}
      </div>
      {data.status ? (
        <div
          className={`mt-1 text-[10px] font-medium uppercase tracking-wide ${
            data.status === "running" ? "text-amber-300" : "text-emerald-300"
          }`}
        >
          {data.status === "running" ? "running" : "completed"}
        </div>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function DecisionNode({ data }: NodeProps<WorkflowFlowNode>) {
  return (
    <div className="relative flex h-[88px] w-[164px] items-center justify-center">
      <Handle type="target" position={Position.Left} />
      <div className="absolute inset-3 rotate-45 rounded-xl border border-cyan-400/70 bg-cyan-400/10 shadow-sm" />
      <div className="relative z-10 max-w-[130px] text-center">
        <div className="text-[10px] font-medium uppercase tracking-wide text-cyan-300">
          Decision
        </div>
        <div className="mt-1 text-xs font-medium text-foreground">
          {data.question ?? "Choose a path"}
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { capability: CapabilityNode, decision: DecisionNode };

export function WorkflowGraphCanvas({
  graph,
  editable = false,
  onChange,
  runId,
  runState,
}: WorkflowGraphCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<
    WorkflowFlowNode,
    Edge
  > | null>(null);

  const signature = useMemo(
    () => JSON.stringify({ graph, runState }),
    [graph, runState],
  );
  useEffect(() => {
    let active = true;
    void layoutNodes(graph, runState).then((nextNodes) => {
      if (active) setNodes(nextNodes);
    });
    setEdges(reactEdges(graph.edges, graph.nodes));
    return () => {
      active = false;
    };
  }, [graph, runState, setEdges, setNodes, signature]);

  useEffect(() => {
    if (!flowInstance || nodes.length === 0) return;
    const frame = window.requestAnimationFrame(() => {
      void flowInstance.fitView({ padding: 0.16, duration: 180 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [flowInstance, nodes.length, signature]);

  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId);
  const selectedEdge = graph.edges.find((edge) => edge.id === selectedEdgeId);
  const selectedFriendlyCondition = selectedEdge
    ? friendlyConditionFromWhen(selectedEdge.when)
    : undefined;

  const emit = (change: WorkflowGraphChange) => onChange?.(change);
  const updateNode = (nextNode: WorkflowGraphNode) =>
    emit((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === nextNode.id ? nextNode : node,
      ),
    }));
  const updateEdge = (nextEdge: WorkflowGraphEdge) =>
    emit((current) => ({
      ...current,
      edges: current.edges.map((edge) =>
        edge.id === nextEdge.id ? nextEdge : edge,
      ),
      nodes: current.nodes.map((node) =>
        node.kind === "decision" && node.id === nextEdge.source && nextEdge.when
          ? { ...node, question: friendlyDecisionQuestion(nextEdge.when) }
          : node,
      ),
    }));

  const promoteToDecision = (
    sourceId: string,
    nextSelectedEdge: WorkflowGraphEdge,
  ) => {
    const sourceNode = graph.nodes.find((node) => node.id === sourceId);
    if (!sourceNode || sourceNode.kind === "decision") return false;
    const usedIds = new Set(graph.nodes.map((node) => node.id));
    let decisionId = `${sourceId}__decision`;
    let suffix = 2;
    while (usedIds.has(decisionId)) {
      decisionId = `${sourceId}__decision-${suffix}`;
      suffix += 1;
    }
    const outgoing = graph.edges
      .filter((edge) => edge.source === sourceId)
      .map((edge) =>
        edge.id === nextSelectedEdge.id ? nextSelectedEdge : edge,
      );
    const decisionNode: WorkflowGraphNode = {
      id: decisionId,
      kind: "decision",
      question: friendlyDecisionQuestion(nextSelectedEdge.when),
    };
    emit({
      ...graph,
      nodes: [...graph.nodes, decisionNode],
      edges: [
        ...graph.edges.filter((edge) => edge.source !== sourceId),
        {
          id: `${sourceId}-${decisionId}`,
          source: sourceId,
          target: decisionId,
        },
        ...outgoing.map((edge) => ({ ...edge, source: decisionId })),
      ],
    });
    setSelectedEdgeId(nextSelectedEdge.id);
    return true;
  };

  const onConnect = (connection: Connection) => {
    if (!editable || !connection.source || !connection.target) return;
    if (
      graph.edges.some(
        (edge) =>
          edge.source === connection.source &&
          edge.target === connection.target,
      )
    )
      return;
    const sourceIndex = graph.nodes.findIndex(
      (node) => node.id === connection.source,
    );
    const targetIndex = graph.nodes.findIndex(
      (node) => node.id === connection.target,
    );
    const next: WorkflowGraphEdge = {
      id: `${connection.source}-${connection.target}-${Date.now()}`,
      source: connection.source,
      target: connection.target,
      ...(targetIndex <= sourceIndex ? { maxIterations: 3 } : {}),
    };
    setEdges((current) => addEdge(connection, current));
    emit({ ...graph, edges: [...graph.edges, next] });
    setSelectedEdgeId(next.id);
  };

  const setEdgeMode = (mode: EdgeMode) => {
    if (!selectedEdge) return;
    const nextEdge = {
      ...selectedEdge,
      ...(mode === "otherwise"
        ? { default: true, when: undefined }
        : mode === "when"
          ? {
              default: undefined,
              when:
                selectedEdge.when && Object.keys(selectedEdge.when).length > 0
                  ? selectedEdge.when
                  : conditionFromFriendlySelection("pass"),
            }
          : { default: undefined, when: undefined }),
    };
    if (
      (mode === "when" || mode === "otherwise") &&
      graph.nodes.find((node) => node.id === selectedEdge.source)?.kind !==
        "decision"
    ) {
      if (promoteToDecision(selectedEdge.source, nextEdge)) {
        setFormError(null);
        return;
      }
    }
    updateEdge(nextEdge);
    setFormError(null);
  };

  const setFriendlyStatus = (status: FriendlyResultStatus) => {
    if (!selectedEdge) return;
    updateEdge({
      ...selectedEdge,
      when: conditionFromFriendlySelection(status),
      default: undefined,
    });
    setFormError(null);
  };

  const updateConditionPath = (oldPath: string, nextPath: string) => {
    if (!selectedEdge) return;
    const path = conditionPathValue(nextPath);
    if (!path) {
      setFormError("Enter the property to check.");
      return;
    }
    const nextWhen = Object.fromEntries(
      Object.entries(selectedEdge.when ?? {}).map(([key, value]) => [
        key === oldPath ? path : key,
        value,
      ]),
    );
    updateEdge({ ...selectedEdge, when: nextWhen });
    setFormError(null);
  };

  const updateConditionValue = (path: string, value: string) => {
    if (!selectedEdge) return;
    updateEdge({
      ...selectedEdge,
      when: {
        ...(selectedEdge.when ?? {}),
        [path]: parseConditionValue(value),
      },
    });
    setFormError(null);
  };

  const removeCondition = (path: string) => {
    if (!selectedEdge) return;
    const nextWhen = Object.fromEntries(
      Object.entries(selectedEdge.when ?? {}).filter(([key]) => key !== path),
    );
    updateEdge({
      ...selectedEdge,
      when: Object.keys(nextWhen).length > 0 ? nextWhen : undefined,
    });
  };

  const addCondition = () => {
    if (!selectedEdge) return;
    const current = selectedEdge.when ?? {};
    let path = "facts.result";
    let suffix = 2;
    while (Object.prototype.hasOwnProperty.call(current, path)) {
      path = `facts.result${suffix}`;
      suffix += 1;
    }
    updateEdge({ ...selectedEdge, when: { ...current, [path]: true } });
  };

  const updateMappingPath = (inputName: string, nextPath: string) => {
    if (!selectedNode) return;
    const source = mappingPathValue(nextPath);
    const inputs = Object.fromEntries(
      Object.entries(selectedNode.inputs ?? {}).map(([key, mapping]) => [
        key,
        key === inputName ? { from: source } : mapping,
      ]),
    );
    updateNode({ ...selectedNode, inputs });
  };

  const removeMapping = (inputName: string) => {
    if (!selectedNode) return;
    const inputs = Object.fromEntries(
      Object.entries(selectedNode.inputs ?? {}).filter(
        ([key]) => key !== inputName,
      ),
    );
    updateNode({
      ...selectedNode,
      inputs: Object.keys(inputs).length > 0 ? inputs : undefined,
    });
  };

  const addMapping = () => {
    if (!selectedNode) return;
    const current = selectedNode.inputs ?? {};
    let name = "input";
    let suffix = 2;
    while (Object.prototype.hasOwnProperty.call(current, name)) {
      name = `input${suffix}`;
      suffix += 1;
    }
    updateNode({
      ...selectedNode,
      inputs: { ...current, [name]: { from: "facts.result" } },
    });
  };

  const edgeIsLoop = selectedEdge ? isBackwardEdge(graph, selectedEdge) : false;
  const selectedNodeIsDecision = selectedNode?.kind === "decision";
  const selectedEdgeSource = selectedEdge
    ? graph.nodes.find((node) => node.id === selectedEdge.source)
    : undefined;
  const selectedEdgeIsDecisionBranch = selectedEdgeSource?.kind === "decision";
  const capabilityCount = graph.nodes.filter(
    (node) => node.kind !== "decision",
  ).length;
  const decisionCount = graph.nodes.filter(
    (node) => node.kind === "decision",
  ).length;
  const displayNodeName = (nodeId: string) => {
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    return node?.capability ?? node?.question ?? "next step";
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {editable
            ? "Connect steps left to right. Branches become visible decisions with Yes and No paths."
            : "Select a step, decision, or path to inspect it."}
        </span>
        <span className="font-mono">
          {capabilityCount} steps
          {decisionCount > 0 ? ` · ${decisionCount} decisions` : ""} ·{" "}
          {graph.edges.length} paths
        </span>
      </div>
      <div
        className={`grid gap-3 ${runState || selectedNode || selectedEdge ? "lg:grid-cols-[minmax(0,1fr)_360px]" : "grid-cols-1"}`}
      >
        <div className="h-[440px] min-h-0 w-full overflow-hidden rounded-md border border-border bg-background">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={setFlowInstance}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => {
              setSelectedNodeId(node.id);
              setSelectedEdgeId(null);
              setFormError(null);
            }}
            onEdgeClick={(_, edge) => {
              setSelectedEdgeId(edge.id);
              setSelectedNodeId(null);
              setFormError(null);
            }}
            onEdgesDelete={(deleted) => {
              if (!editable) return;
              const ids = new Set(deleted.map((edge) => edge.id));
              emit((current) => ({
                ...current,
                edges: current.edges.filter((edge) => !ids.has(edge.id)),
              }));
              setSelectedEdgeId((current) =>
                ids.has(current ?? "") ? null : current,
              );
            }}
            onNodesDelete={(deleted) => {
              if (!editable) return;
              emit((current) =>
                deleted.reduce(
                  (next, node) => removeWorkflowGraphNode(next, node.id),
                  current,
                ),
              );
              const ids = new Set(deleted.map((node) => node.id));
              setSelectedNodeId((current) =>
                ids.has(current ?? "") ? null : current,
              );
            }}
            nodesDraggable={editable}
            nodesConnectable={editable}
            edgesFocusable={editable}
            deleteKeyCode={editable ? ["Backspace", "Delete"] : null}
            fitView
            fitViewOptions={{ padding: 0.16 }}
          >
            <Background gap={18} size={1} />
            <Controls showInteractive={editable} />
          </ReactFlow>
        </div>

        {runState || selectedNode || selectedEdge ? (
          <aside className="min-w-0 rounded-md border border-border bg-card p-4">
            {runState ? (
              <div className="mb-4 rounded border border-border bg-background p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium capitalize">
                    Run {runState.status}
                  </span>
                  {runId ? (
                    <span className="font-mono text-muted-foreground">
                      {runId}
                    </span>
                  ) : null}
                </div>
                {runState.blocker ? (
                  <p className="mt-2 text-destructive">{runState.blocker}</p>
                ) : null}
              </div>
            ) : null}

            {selectedNode ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">
                      {selectedNodeIsDecision
                        ? friendlyDecisionQuestion(
                            graph.edges.find(
                              (edge) =>
                                edge.source === selectedNode.id && edge.when,
                            )?.when,
                          )
                        : (selectedNode.capability ?? selectedNode.id)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selectedNodeIsDecision
                        ? "Choose what happens next"
                        : "Workflow step"}
                    </div>
                  </div>
                  {editable && !selectedNodeIsDecision ? (
                    <Button
                      type="button"
                      variant={
                        graph.startAt === selectedNode.id
                          ? "default"
                          : "outline"
                      }
                      size="sm"
                      onClick={() =>
                        emit({ ...graph, startAt: selectedNode.id })
                      }
                    >
                      {graph.startAt === selectedNode.id
                        ? "Starting step"
                        : "Make starting step"}
                    </Button>
                  ) : null}
                </div>
                {selectedNodeIsDecision ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-cyan-400/25 bg-cyan-400/5 p-3">
                      <Label>What should happen next?</Label>
                      <div className="mt-1 text-sm font-medium">
                        {friendlyDecisionQuestion(
                          graph.edges.find(
                            (edge) =>
                              edge.source === selectedNode.id && edge.when,
                          )?.when,
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Select a branch to choose the plain-language result that
                        sends work down it.
                      </p>
                    </div>
                    <div className="space-y-2">
                      {graph.edges
                        .filter((edge) => edge.source === selectedNode.id)
                        .map((edge) => (
                          <Button
                            key={edge.id}
                            type="button"
                            variant="ghost"
                            size="clear"
                            className="flex w-full items-center justify-between rounded border border-border bg-background px-3 py-2 font-normal text-left text-xs hover:bg-background hover:text-foreground"
                            onClick={() => {
                              setSelectedEdgeId(edge.id);
                              setSelectedNodeId(null);
                            }}
                          >
                            <span className="font-medium">
                              {edge.default ? "No" : edge.when ? "Yes" : "Path"}
                            </span>
                            <span className="text-muted-foreground">
                              Continue to {displayNodeName(edge.target)}
                            </span>
                          </Button>
                        ))}
                    </div>
                  </div>
                ) : null}
                {!selectedNodeIsDecision ? (
                  <div className="space-y-2">
                    <div>
                      <Label>Capability inputs</Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Pass a result from an earlier step into this capability.
                      </p>
                    </div>
                    {Object.entries(selectedNode.inputs ?? {}).map(
                      ([name, mapping]) => (
                        <div
                          key={name}
                          className="grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] sm:items-end"
                        >
                          <div className="space-y-1">
                            <Label htmlFor={`workflow-input-name-${name}`}>
                              Input
                            </Label>
                            <Input
                              id={`workflow-input-name-${name}`}
                              value={name}
                              readOnly
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`workflow-input-source-${name}`}>
                              Earlier result
                            </Label>
                            <Input
                              id={`workflow-input-source-${name}`}
                              defaultValue={mappingPathLabel(mapping.from)}
                              readOnly={!editable}
                              placeholder="feedback"
                              onBlur={(event) =>
                                updateMappingPath(name, event.target.value)
                              }
                            />
                          </div>
                          {editable ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeMapping(name)}
                            >
                              Remove
                            </Button>
                          ) : null}
                        </div>
                      ),
                    )}
                    {editable ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addMapping}
                      >
                        Add input
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {selectedEdge ? (
              <div className="space-y-5">
                <div>
                  <div className="text-sm font-medium">
                    {selectedEdgeIsDecisionBranch
                      ? `${selectedEdge.default ? "No" : "Yes"} branch`
                      : "Path"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Continue to{" "}
                    <span className="font-medium text-foreground">
                      {displayNodeName(selectedEdge.target)}
                    </span>
                  </div>
                </div>

                {selectedEdgeIsDecisionBranch ? (
                  selectedEdge.default ? (
                    <div className="rounded-lg border border-border bg-background p-3 text-sm">
                      <p>
                        If the answer is <span className="font-medium">No</span>
                        , continue to {displayNodeName(selectedEdge.target)}.
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        This is the fallback path when the Yes branch does not
                        match.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-lg border border-cyan-400/30 bg-cyan-400/5 p-3">
                      <div>
                        <Label htmlFor="workflow-friendly-status">
                          When should this branch run?
                        </Label>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Choose the plain-language result from the step before
                          this decision.
                        </p>
                      </div>
                      {selectedFriendlyCondition?.kind === "status" ? (
                        <label className="flex flex-wrap items-center gap-2 text-sm leading-7">
                          <span>When the previous step</span>
                          <select
                            id="workflow-friendly-status"
                            className="h-9 min-w-40 rounded-md border border-border bg-background px-2 text-sm"
                            value={selectedFriendlyCondition.status}
                            disabled={!editable}
                            onChange={(event) =>
                              setFriendlyStatus(
                                event.target.value as FriendlyResultStatus,
                              )
                            }
                          >
                            {FRIENDLY_RESULT_STATUSES.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <span>, follow this branch.</span>
                        </label>
                      ) : (
                        <div className="space-y-2 text-sm">
                          <p>This workflow uses a custom result rule.</p>
                          <p className="text-xs text-muted-foreground">
                            You can keep it as-is, or replace it with a simple
                            step result above.
                          </p>
                          {editable ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setFriendlyStatus("pass")}
                            >
                              Use a simple result check
                            </Button>
                          ) : null}
                        </div>
                      )}
                      {selectedFriendlyCondition?.kind === "status" ? (
                        <p className="text-xs text-muted-foreground">
                          In plain terms: if the step{" "}
                          {friendlyStatusLabel(
                            selectedFriendlyCondition.status,
                          )}
                          , this path is used; otherwise the No path is used.
                        </p>
                      ) : null}
                      {selectedFriendlyCondition?.kind === "advanced" ? (
                        <details className="rounded border border-border bg-background p-3">
                          <summary className="cursor-pointer text-xs font-medium">
                            Advanced result rule
                          </summary>
                          <div className="space-y-2 pt-3">
                            <p className="text-xs text-muted-foreground">
                              This is for workflows that intentionally inspect a
                              custom result property.
                            </p>
                            {Object.entries(selectedEdge.when ?? {}).map(
                              ([path, expected]) => (
                                <div
                                  key={path}
                                  className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
                                >
                                  <div className="space-y-1">
                                    <Label
                                      htmlFor={`workflow-condition-field-${path}`}
                                    >
                                      Property
                                    </Label>
                                    <Input
                                      id={`workflow-condition-field-${path}`}
                                      defaultValue={conditionPathLabel(path)}
                                      readOnly={!editable}
                                      placeholder="needsFix"
                                      onBlur={(event) =>
                                        updateConditionPath(
                                          path,
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label
                                      htmlFor={`workflow-condition-value-${path}`}
                                    >
                                      Expected answer
                                    </Label>
                                    <Input
                                      id={`workflow-condition-value-${path}`}
                                      defaultValue={formatConditionValue(
                                        expected,
                                      )}
                                      readOnly={!editable}
                                      placeholder="true"
                                      onBlur={(event) =>
                                        updateConditionValue(
                                          path,
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </div>
                                  {editable ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onMouseDown={(event) =>
                                        event.preventDefault()
                                      }
                                      onClick={() => removeCondition(path)}
                                    >
                                      Remove
                                    </Button>
                                  ) : null}
                                </div>
                              ),
                            )}
                            {editable ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={addCondition}
                              >
                                Add another check
                              </Button>
                            ) : null}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  )
                ) : (
                  <div className="space-y-2 rounded-lg border border-border bg-background p-3">
                    <Label htmlFor="workflow-edge-mode">
                      How should this path run?
                    </Label>
                    <select
                      id="workflow-edge-mode"
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                      value={edgeMode(selectedEdge)}
                      disabled={!editable}
                      onChange={(event) =>
                        setEdgeMode(event.target.value as EdgeMode)
                      }
                    >
                      <option value="always">Always continue</option>
                      <option value="when">
                        When the previous step has a result
                      </option>
                      <option value="otherwise">
                        If no other branch matches
                      </option>
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Choosing a result creates a visual Yes/No decision on the
                      canvas.
                    </p>
                  </div>
                )}

                {edgeIsLoop ? (
                  <div className="space-y-2 rounded-lg border border-orange-500/25 bg-orange-500/5 p-3">
                    <div>
                      <Label htmlFor="workflow-edge-repeats">
                        Prevent an endless loop
                      </Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        This path goes back to an earlier step. Stop after this
                        many trips around the loop.
                      </p>
                    </div>
                    <Input
                      id="workflow-edge-repeats"
                      type="number"
                      min={1}
                      disabled={!editable}
                      value={selectedEdge.maxIterations ?? ""}
                      onChange={(event) => {
                        const value = Number.parseInt(event.target.value, 10);
                        updateEdge({
                          ...selectedEdge,
                          maxIterations:
                            Number.isInteger(value) && value > 0
                              ? value
                              : undefined,
                        });
                      }}
                      placeholder="3"
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {formError ? (
              <p className="mt-3 text-xs text-destructive">{formError}</p>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@kody-ade/base/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@kody-ade/base/ui/dialog";
import { Input } from "@kody-ade/base/ui/input";
import { Label } from "@kody-ade/base/ui/label";
import type {
  CreateWorkflowDefinitionInput,
  WorkflowDefinitionRecord,
} from "../workflow-definitions";
import { validateWorkflowDefinition } from "../workflow-definitions";
import {
  addWorkflowGraphStep,
  graphWorkflowDefinition,
  removeWorkflowGraphNode,
  validateWorkflowGraph,
  workflowDefinitionGraph,
  type WorkflowGraph,
} from "../workflow-graph";
import { WorkflowGraphCanvas } from "./WorkflowGraphCanvas";

interface WorkflowEditorDialogProps {
  open: boolean;
  initial?: WorkflowDefinitionRecord;
  capabilities: Array<{ slug: string; describe?: string }>;
  capabilitiesLoading: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CreateWorkflowDefinitionInput) => Promise<void>;
}

const EMPTY_GRAPH: WorkflowGraph = { startAt: null, nodes: [], edges: [] };

export function WorkflowEditorDialog({
  open,
  initial,
  capabilities,
  capabilitiesLoading,
  saving,
  onOpenChange,
  onSubmit,
}: WorkflowEditorDialogProps) {
  const [name, setName] = useState("");
  const [graph, setGraph] = useState<WorkflowGraph>(EMPTY_GRAPH);
  const [capabilityToAdd, setCapabilityToAdd] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setName(initial?.workflow.name ?? "");
    setGraph(initial ? workflowDefinitionGraph(initial.workflow) : EMPTY_GRAPH);
    setCapabilityToAdd(capabilities[0]?.slug ?? "");
    setErrors([]);
  }, [capabilities, initial, open]);

  const capabilitySteps = useMemo(
    () => graph.nodes.filter((node) => node.kind !== "decision"),
    [graph.nodes],
  );

  const addStep = () => {
    if (!capabilityToAdd) return;
    setGraph((current) => addWorkflowGraphStep(current, capabilityToAdd));
    setErrors([]);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = name.trim();
    const nextErrors: string[] = [];
    if (!nextName) nextErrors.push("Give the workflow a name.");
    if (capabilitySteps.length === 0)
      nextErrors.push("Add at least one workflow step.");
    nextErrors.push(...validateWorkflowGraph(graph));
    const definition = graphWorkflowDefinition(
      nextName,
      graph.nodes,
      graph.edges,
      graph.startAt,
    );
    nextErrors.push(
      ...validateWorkflowDefinition(definition).map((issue) => issue.message),
    );
    const uniqueErrors = Array.from(new Set(nextErrors));
    if (uniqueErrors.length > 0) {
      setErrors(uniqueErrors);
      return;
    }
    await onSubmit({
      name: nextName,
      capabilities: definition.capabilities,
      startAt: definition.startAt,
      steps: definition.steps,
      runWithoutApproval: initial?.workflow.runWithoutApproval,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        modalSize="wide"
        modalHeight="viewport"
        className="min-w-0"
      >
        <DialogHeader>
          <DialogTitle>
            {initial ? "Edit workflow" : "New workflow"}
          </DialogTitle>
          <DialogDescription>
            Add steps, connect them, and select a path to choose when it runs.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden"
          onSubmit={submit}
        >
          <div className="space-y-2">
            <Label htmlFor="workflow-name">Workflow name</Label>
            <Input
              id="workflow-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Release readiness"
              autoFocus
            />
          </div>

          <div className="grid min-h-0 flex-1 gap-4 overflow-auto lg:grid-cols-[260px_minmax(0,1fr)] lg:overflow-hidden">
            <aside className="space-y-4 rounded-md border border-border bg-muted/20 p-3 lg:overflow-y-auto">
              <div className="space-y-2">
                <Label htmlFor="workflow-capability-to-add">
                  Capability to add
                </Label>
                <select
                  id="workflow-capability-to-add"
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                  value={capabilityToAdd}
                  disabled={capabilitiesLoading || capabilities.length === 0}
                  onChange={(event) => setCapabilityToAdd(event.target.value)}
                >
                  {capabilities.length === 0 ? (
                    <option value="">
                      {capabilitiesLoading
                        ? "Loading capabilities..."
                        : "No capabilities available"}
                    </option>
                  ) : (
                    capabilities.map((capability) => (
                      <option key={capability.slug} value={capability.slug}>
                        {capability.slug}
                      </option>
                    ))
                  )}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={!capabilityToAdd || capabilitiesLoading}
                  onClick={addStep}
                >
                  <Plus className="h-4 w-4" />
                  Add step
                </Button>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Workflow steps
                </div>
                {capabilitySteps.length === 0 ? (
                  <p className="rounded border border-dashed border-border p-3 text-xs text-muted-foreground">
                    Add the first step to start the workflow.
                  </p>
                ) : (
                  capabilitySteps.map((step, index) => (
                    <div
                      key={step.id}
                      className="flex items-center justify-between gap-2 rounded border border-border bg-background p-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {step.capability}
                        </div>
                        <div className="truncate font-mono text-[10px] text-muted-foreground">
                          {step.id}
                          {graph.startAt === step.id
                            ? " · starts here"
                            : ` · step ${index + 1}`}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 shrink-0 px-0 text-destructive hover:text-destructive"
                        aria-label={`Remove step ${step.id}`}
                        onClick={() =>
                          setGraph((current) =>
                            removeWorkflowGraphNode(current, step.id),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </aside>

            <div className="min-w-0 lg:overflow-y-auto">
              {capabilitySteps.length > 0 ? (
                <WorkflowGraphCanvas
                  graph={graph}
                  editable
                  onChange={(change) =>
                    setGraph((current) =>
                      typeof change === "function" ? change(current) : change,
                    )
                  }
                />
              ) : (
                <div className="flex h-[440px] items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
                  Your workflow will appear here.
                </div>
              )}
            </div>
          </div>

          {errors.length > 0 ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              <div className="font-medium">The workflow needs attention:</div>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {initial ? "Save workflow" : "Create workflow"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

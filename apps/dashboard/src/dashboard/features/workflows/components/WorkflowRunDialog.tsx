"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@kody-ade/base/ui/button";
import { Checkbox } from "@kody-ade/base/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@kody-ade/base/ui/dialog";
import { Input } from "@kody-ade/base/ui/input";
import { Label } from "@kody-ade/base/ui/label";
import {
  validateWorkflowInput,
  type WorkflowDefinitionRecord,
} from "@dashboard/lib/workflow-definitions";
import {
  parseWorkflowRunInput,
  workflowRunInputForm,
} from "@dashboard/features/workflows/workflow-run-input-form";

interface WorkflowRunDialogProps {
  workflow: WorkflowDefinitionRecord | null;
  pending: boolean;
  onClose(): void;
  onSubmit(input: Record<string, unknown>): Promise<void>;
}

export function WorkflowRunDialog({
  workflow,
  pending,
  onClose,
  onSubmit,
}: WorkflowRunDialogProps) {
  const inputForm = useMemo(
    () => workflowRunInputForm(workflow?.workflow.inputSchema),
    [workflow],
  );
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [jsonInput, setJsonInput] = useState("{}");
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!workflow) return;
    setValues({});
    setJsonInput("{}");
    setErrors([]);
  }, [workflow]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!workflow) return;
    let input: Record<string, unknown>;
    try {
      input = parseWorkflowRunInput(inputForm, values, jsonInput);
    } catch (error) {
      setErrors([
        error instanceof Error ? error.message : "Workflow input is invalid.",
      ]);
      return;
    }
    const issues = validateWorkflowInput(
      input,
      workflow.workflow.inputSchema,
    );
    if (issues.length > 0) {
      setErrors(issues.map((issue) => issue.message));
      return;
    }
    setErrors([]);
    await onSubmit(input);
  };

  return (
    <Dialog open={!!workflow} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Run {workflow?.workflow.name ?? "workflow"}</DialogTitle>
          <DialogDescription>
            Enter the information this workflow needs before it starts.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          {inputForm.kind === "json" ? (
            <div className="space-y-2">
              <Label htmlFor="workflow-run-json">Input (JSON)</Label>
              <textarea
                id="workflow-run-json"
                className="min-h-32 w-full rounded-md border border-border bg-background p-3 font-mono text-sm"
                value={jsonInput}
                onChange={(event) => setJsonInput(event.target.value)}
              />
            </div>
          ) : (
            inputForm.fields.map((field) => (
              <div className="space-y-2" key={field.name}>
                <Label htmlFor={`workflow-run-${field.name}`}>
                  {field.name}
                  {field.required ? " *" : ""}
                </Label>
                {field.type === "boolean" ? (
                  <Checkbox
                    id={`workflow-run-${field.name}`}
                    checked={values[field.name] === true}
                    onCheckedChange={(checked) =>
                      setValues((current) => ({
                        ...current,
                        [field.name]: checked === true,
                      }))
                    }
                  />
                ) : (
                  <Input
                    id={`workflow-run-${field.name}`}
                    type={
                      field.type === "integer" || field.type === "number"
                        ? "number"
                        : "text"
                    }
                    min={field.minimum}
                    step={field.type === "integer" ? 1 : undefined}
                    required={field.required}
                    value={String(values[field.name] ?? "")}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [field.name]: event.target.value,
                      }))
                    }
                  />
                )}
                {field.description ? (
                  <p className="text-xs text-muted-foreground">
                    {field.description}
                  </p>
                ) : null}
              </div>
            ))
          )}
          {errors.length > 0 ? (
            <ul className="space-y-1 text-sm text-destructive">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Continue
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

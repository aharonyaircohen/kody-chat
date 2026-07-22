/**
 * @fileType util
 * @domain view-renderers
 * @pattern builtin-defaults
 * @ai-summary Built-in renderer definitions shipped with the package. A state
 *   repo file with the same slug overrides its built-in; deleting the file
 *   reverts to the built-in.
 */
import { parseViewRendererDefinition } from "./definition";
import type { ViewRendererDefinition } from "./definition";

const BUILTIN_SOURCES: readonly string[] = [
  JSON.stringify({
    slug: "approval-card",
    name: "Approval card",
    purpose: "approval-card",
    description:
      "Structured approval card with a title, optional body, and action buttons.",
    rule: "Use this purpose when Kody asks the user to approve, edit, cancel, continue, or confirm before taking the next step.",
    data: {
      title: { type: "text", description: "Card heading shown at the top." },
      body: {
        type: "text",
        optional: true,
        description: "Optional supporting text shown under the title.",
      },
      actions: {
        type: "actions",
        optional: true,
        description: "List of action buttons.",
      },
    },
    defaults: {
      actions: [
        {
          id: "approve",
          label: "Approve",
          response: "approve",
          variant: "primary",
        },
        {
          id: "cancel",
          label: "Cancel",
          response: "cancel",
          variant: "secondary",
        },
      ],
    },
    type: "layout",
    ui: {
      type: "stack",
      children: [
        { type: "text", variant: "title", value: "$title" },
        { type: "text", value: "$body" },
        {
          type: "row",
          for: "$actions",
          as: "action",
          item: { type: "button", label: "$action.label", action: "$action" },
        },
      ],
    },
  }),
  JSON.stringify({
    slug: "selection-list",
    name: "Selection list",
    purpose: "selection-list",
    description: "Single-choice list of selectable items.",
    rule: "Use this purpose when Kody asks the user to choose, pick, or select exactly one entry from a list of options.",
    data: {
      title: { type: "text", description: "Card heading shown at the top." },
      body: {
        type: "text",
        optional: true,
        description: "Optional supporting text shown under the title.",
      },
      items: { type: "selection", description: "List of selectable items." },
    },
    type: "layout",
    ui: {
      type: "stack",
      children: [
        { type: "text", variant: "title", value: "$title" },
        { type: "text", value: "$body" },
        {
          type: "list",
          for: "$items",
          as: "item",
          item: { type: "button", label: "$item.label", action: "$item" },
        },
      ],
    },
  }),
  JSON.stringify({
    slug: "multi-select-list",
    name: "Multi-select list",
    purpose: "multi-select-list",
    description: "Multi-choice list of selectable items.",
    rule: "Use this purpose when Kody asks the user to choose, pick, or select multiple, several, a few, one or more, or zero or more entries from a list of options.",
    data: {
      title: { type: "text", description: "Card heading shown at the top." },
      body: {
        type: "text",
        optional: true,
        description: "Optional supporting text shown under the title.",
      },
      items: { type: "selection", description: "List of selectable items." },
    },
    type: "layout",
    ui: {
      type: "stack",
      children: [
        { type: "text", variant: "title", value: "$title" },
        { type: "text", value: "$body" },
        {
          type: "list",
          for: "$items",
          as: "item",
          item: {
            type: "checkbox",
            name: "selected",
            value: "$item.id",
            label: "$item.label",
          },
        },
        { type: "submit", label: "Confirm" },
      ],
    },
  }),
  JSON.stringify({
    slug: "guided-flow-status",
    name: "GuidedFlow status",
    purpose: "guided-flow-status",
    description:
      "Non-blocking greeting and status card for an unfinished GuidedFlow.",
    rule: "Use this renderer to tell the user about an unfinished GuidedFlow and let them explicitly resume it or open the Guided Flows manager.",
    data: {
      greeting: { type: "text", description: "Overall chat greeting." },
      title: { type: "text", description: "Unfinished flow notice." },
      step: { type: "text", description: "Current flow progress." },
      instanceId: { type: "text", description: "Flow instance identifier." },
      actions: { type: "actions", description: "Resume action." },
    },
    type: "layout",
    ui: {
      type: "stack",
      children: [
        { type: "text", variant: "title", value: "$greeting" },
        { type: "text", value: "$title" },
        { type: "text", value: "$step" },
        {
          type: "row",
          for: "$actions",
          as: "action",
          item: { type: "button", label: "$action.label", action: "$action" },
        },
      ],
    },
  }),
  JSON.stringify({
    slug: "guided-form",
    name: "Guided form",
    purpose: "guided-form",
    description: "Small validated form used by a GuidedFlow step.",
    rule: "Use this purpose when a guided step needs a few user-entered values before continuing.",
    data: {
      title: { type: "text", description: "Form heading." },
      body: { type: "text", optional: true, description: "Form explanation." },
      fields: { type: "fields", description: "Input field definitions." },
      submitLabel: {
        type: "text",
        optional: true,
        description: "Submit label.",
      },
    },
    type: "layout",
    ui: {
      type: "stack",
      children: [
        { type: "text", variant: "title", value: "$title" },
        { type: "text", value: "$body" },
        {
          type: "list",
          for: "$fields",
          as: "field",
          item: {
            type: "input",
            name: "$field.name",
            label: "$field.label",
            value: "$field.value",
            inputType: "$field.inputType",
            readOnly: false,
          },
        },
        { type: "submit", label: "$submitLabel" },
      ],
    },
  }),
];

/** Validated at module load so a bad built-in fails fast in tests/build. */
export const BUILTIN_VIEW_RENDERER_DEFINITIONS: readonly ViewRendererDefinition[] =
  BUILTIN_SOURCES.map((source) => parseViewRendererDefinition(source));

export function getBuiltinViewRendererDefinition(
  slug: string,
): ViewRendererDefinition | null {
  return (
    BUILTIN_VIEW_RENDERER_DEFINITIONS.find(
      (definition) => definition.slug === slug,
    ) ?? null
  );
}
